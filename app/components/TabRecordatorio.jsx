'use client';
import { useState, useEffect, useRef } from 'react';
import { Play, Pause, CheckCircle, RefreshCw, Settings, Save } from 'lucide-react';

const MESES_N = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function getMensajeDefault(diaVencimiento) {
  const d = new Date();
  const mes = MESES_N[d.getMonth()];
  const anio = d.getFullYear();
  const suspension = new Date(d.getFullYear(), d.getMonth(), diaVencimiento + 3);
  const diaSemana = suspension.getDay();
  if (diaSemana === 6) suspension.setDate(suspension.getDate() + 2);
  else if (diaSemana === 0) suspension.setDate(suspension.getDate() + 1);
  const nombreDia = DIAS[suspension.getDay()];
  const diaSusp = suspension.getDate();
  return `⚠️ Atención ⚠️\n\nEstimado Cliente, es bien informarle.\n\nQue la Fecha límite de pago finaliza el *${diaVencimiento} de ${mes} del ${anio}*. Si ya realizó su pago favor notificarlo.\n\nDe no realizar el pago a partir del día ${diaVencimiento}, el servicio entrará en suspensión el día *${nombreDia} ${diaSusp} de ${mes} del ${anio}* a partir de las 10 AM.\n\nMuchas Gracias de antemano!!`;
}

export default function TabRecordatorio({ clientes, showToast, empresaActual, diaVencimiento, setDiaVencimiento, mensajeRecordatorio, setMensajeRecordatorio }) {
  const [cola, setCola] = useState([]);
  const [activo, setActivo] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const [cargando, setCargando] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [diaTemp, setDiaTemp] = useState(diaVencimiento || 15);
  const [mensajeTemp, setMensajeTemp] = useState('');
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    setDiaTemp(diaVencimiento || 15);
    setMensajeTemp(mensajeRecordatorio || getMensajeDefault(diaVencimiento || 15));
  }, [diaVencimiento, mensajeRecordatorio]);

  const cargarSubgrupos = async () => {
    try {
      const res = await fetch(`/api/subgrupos?empresa_id=${empresaActual?.id || 1}`);
      return await res.json();
    } catch(e) { return []; }
  };

  const cargarLista = async () => {
    setCargando(true);
    try {
      const empresa_id = empresaActual?.id || 1;
      const res = await fetch(`/api/recordatorios?empresa_id=${empresa_id}`);
      const yaEnviados = await res.json();

      // Solo clientes Vencidos
      const pendientes = (clientes || []).filter(c =>
        c.estado === 'Vencido' &&
        !c.suspendido &&
        c.contacto &&
        !yaEnviados.includes(c.id)
      );

      // Subgrupos Vencidos
      const todosSubgrupos = await cargarSubgrupos();
      const subgruposPendientes = todosSubgrupos.filter(sg =>
        sg.estado === 'Vencido' &&
        sg.contacto &&
        !yaEnviados.includes(`sg_${sg.id}`)
      ).map(sg => ({ ...sg, _enviado: false, _esSubgrupo: true, id: `sg_${sg.id}`, _idReal: sg.id }));

      setCola([...pendientes.map(c => ({ ...c, _enviado: false })), ...subgruposPendientes]);
    } catch(e) {
      setCola((clientes || []).filter(c => c.estado === 'Vencido' && !c.suspendido && c.contacto).map(c => ({ ...c, _enviado: false })));
    }
    setCargando(false);
  };

  useEffect(() => { cargarLista(); }, [clientes]);

  useEffect(() => {
    if (!activo) {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
      return;
    }
    const pendientes = cola.filter(c => !c._enviado);
    if (pendientes.length === 0) { setActivo(false); return; }

    setCountdown(120);
    enviarMensaje(pendientes[0]);

    countdownRef.current = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 120 : prev - 1);
    }, 1000);

    intervalRef.current = setInterval(() => {
      setCola(prev => {
        const pend = prev.filter(c => !c._enviado);
        if (pend.length === 0) {
          clearInterval(intervalRef.current);
          clearInterval(countdownRef.current);
          setActivo(false);
          showToast('✅ Recordatorios completados', 'success');
          return prev;
        }
        enviarMensaje(pend[0]);
        setCountdown(120);
        return prev;
      });
    }, 120000);

    return () => { clearInterval(intervalRef.current); clearInterval(countdownRef.current); };
  }, [activo]);

  async function enviarMensaje(cliente) {
    try {
      const mensaje = mensajeRecordatorio || getMensajeDefault(diaVencimiento || 15);
      if (window.electronAPI?.whatsappEnviarMensaje) {
        await window.electronAPI.whatsappEnviarMensaje(cliente.contacto, mensaje);
      }
      const idGuardar = cliente._esSubgrupo ? `sg_${cliente._idReal}` : cliente.id;
      await fetch('/api/recordatorios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: idGuardar, empresa_id: empresaActual?.id || 1 })
      }).catch(() => {});
      setCola(prev => prev.map(c => c.id === cliente.id ? { ...c, _enviado: true } : c));
      showToast(`✅ Recordatorio enviado a ${cliente.nombre}`, 'success');
    } catch(err) {
      showToast(`❌ Error enviando a ${cliente.nombre}`, 'error');
    }
  }

  async function guardarConfig() {
    setDiaVencimiento(diaTemp);
    setMensajeRecordatorio(mensajeTemp);
    await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave:'dia_vencimiento', valor: String(diaTemp) }) }).catch(()=>{});
    await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave:'mensaje_recordatorio', valor: mensajeTemp }) }).catch(()=>{});
    setShowConfig(false);
    showToast('✅ Configuración guardada', 'success');
  }

  const pendientes = cola.filter(c => !c._enviado);
  const completados = cola.filter(c => c._enviado);

  return (
    <div style={{ padding:'1.5rem', maxWidth:'900px', margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
        <div>
          <h2 style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--text)', margin:0 }}>Recordatorio de Cobro</h2>
          <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', margin:'4px 0 0' }}>
            Clientes vencidos (día {diaVencimiento || 15}+) · Envío automático cada 2 minutos
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {activo && (
            <div style={{ fontSize:'12px', color:'#ea580c', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'20px', padding:'4px 12px' }}>
              ⏱ Próximo en {countdown}s
            </div>
          )}
          <button onClick={() => setShowConfig(!showConfig)} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:600, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', cursor:'pointer' }}>
            <Settings size={13}/> Config
          </button>
          <button onClick={cargarLista} disabled={activo} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:600, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', cursor: activo ? 'not-allowed' : 'pointer' }}>
            <RefreshCw size={13}/> Refrescar
          </button>
          <button onClick={() => setActivo(!activo)} disabled={pendientes.length === 0} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 18px', borderRadius:'8px', fontSize:'13px', fontWeight:600, border:'none', cursor: pendientes.length === 0 ? 'not-allowed' : 'pointer', background: activo ? '#ef4444' : '#16a34a', color:'white', opacity: pendientes.length === 0 ? 0.5 : 1 }}>
            {activo ? <><Pause size={14}/> Pausar</> : <><Play size={14}/> Iniciar Cola</>}
          </button>
        </div>
      </div>

      {/* Panel de configuración */}
      {showConfig && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', marginBottom:'16px' }}>
          <h3 style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', margin:'0 0 12px' }}>Configuración de Recordatorio</h3>
          <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:'12px', alignItems:'start' }}>
            <div>
              <label style={{ display:'block', fontSize:'11px', fontWeight:600, color:'var(--text-muted)', marginBottom:'5px', textTransform:'uppercase' }}>Día de vencimiento</label>
              <input type="number" min="1" max="31" value={diaTemp} onChange={e => setDiaTemp(parseInt(e.target.value) || 15)} style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:'13px', textAlign:'center' }}/>
            </div>
            <div>
              <label style={{ display:'block', fontSize:'11px', fontWeight:600, color:'var(--text-muted)', marginBottom:'5px', textTransform:'uppercase' }}>Mensaje de recordatorio</label>
              <textarea value={mensajeTemp} onChange={e => setMensajeTemp(e.target.value)} rows={5} style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:'12px', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px', marginTop:'12px', justifyContent:'flex-end' }}>
            <button onClick={() => setMensajeTemp(getMensajeDefault(diaTemp))} style={{ padding:'6px 12px', borderRadius:'6px', border:'1px solid var(--border)', background:'none', color:'var(--text-muted)', fontSize:'12px', cursor:'pointer' }}>Restablecer mensaje</button>
            <button onClick={guardarConfig} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 14px', borderRadius:'6px', background:'#1a1915', color:'white', border:'none', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
              <Save size={12}/> Guardar
            </button>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'1.5rem' }}>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', padding:'14px' }}>
          <div style={{ fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'4px' }}>Total</div>
          <div style={{ fontSize:'22px', fontWeight:700, color:'var(--text)' }}>{cola.length}</div>
        </div>
        <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'10px', padding:'14px' }}>
          <div style={{ fontSize:'10px', color:'#ea580c', textTransform:'uppercase', marginBottom:'4px' }}>Pendientes</div>
          <div style={{ fontSize:'22px', fontWeight:700, color:'#ea580c' }}>{pendientes.length}</div>
        </div>
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'14px' }}>
          <div style={{ fontSize:'10px', color:'#16a34a', textTransform:'uppercase', marginBottom:'4px' }}>Enviados</div>
          <div style={{ fontSize:'22px', fontWeight:700, color:'#16a34a' }}>{completados.length}</div>
        </div>
      </div>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ padding:'10px 16px', background:'var(--surface-2)', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr 130px 120px', gap:'10px' }}>
          <span style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase' }}>Cliente</span>
          <span style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase' }}>Monto</span>
          <span style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase' }}>Estado</span>
        </div>
        {cargando && <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)' }}>Cargando...</div>}
        {!cargando && cola.length === 0 && (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)', fontSize:'14px' }}>
            No hay clientes vencidos este mes
          </div>
        )}
        {!cargando && cola.map(cliente => (
          <div key={cliente.id} style={{ display:'grid', gridTemplateColumns:'1fr 130px 120px', gap:'10px', padding:'12px 16px', borderBottom:'1px solid var(--border)', background: cliente._enviado ? '#f0fdf4' : 'transparent', transition:'all 0.3s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'28px', height:'28px', borderRadius:'50%', background: cliente._enviado ? '#16a34a' : '#dc2626', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'11px', fontWeight:700, flexShrink:0 }}>
                {cliente._enviado ? <CheckCircle size={14}/> : (cliente.nombre||'?')[0]}
              </div>
              <div>
                <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text)', textDecoration: cliente._enviado ? 'line-through' : 'none' }}>{cliente.nombre}</div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{cliente.contacto}</div>
              </div>
            </div>
            <div style={{ fontSize:'13px', color:'var(--text)', display:'flex', alignItems:'center', fontFamily:'monospace' }}>
              ${parseFloat(cliente.monto || 0).toLocaleString('en-US', { minimumFractionDigits:2 })}
            </div>
            <div style={{ display:'flex', alignItems:'center' }}>
              <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:600, background: cliente._enviado ? '#dcfce7' : '#fef2f2', color: cliente._enviado ? '#16a34a' : '#dc2626' }}>
                {cliente._enviado ? '✓ Enviado' : 'Vencido'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
