'use client';
import { useState, useEffect, useRef } from 'react';
import { Play, Pause, CheckCircle, RefreshCw, Settings, Save } from 'lucide-react';

const MESES_N = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function getMensajeRecordatorio(diaVencimiento) {
  const d = new Date();
  const mes = MESES_N[d.getMonth()];
  const anio = d.getFullYear();
  return `⚠️ Atención ⚠️\n\nEstimado Cliente, es bien informarle.\n\nQue la Fecha límite de pago finaliza el *${diaVencimiento} de ${mes} del ${anio}*. Si ya realizó su pago favor notificarlo.\n\nMuchas Gracias de antemano!!`;
}

function getMensajeVencido(diaVencimiento) {
  const d = new Date();
  const mes = MESES_N[d.getMonth()];
  const anio = d.getFullYear();
  const suspension = new Date(d.getFullYear(), d.getMonth(), diaVencimiento + 3);
  const diaSemana = suspension.getDay();
  if (diaSemana === 6) suspension.setDate(suspension.getDate() + 2);
  else if (diaSemana === 0) suspension.setDate(suspension.getDate() + 1);
  const nombreDia = DIAS[suspension.getDay()];
  const diaSusp = suspension.getDate();
  return `🚨 AVISO IMPORTANTE 🚨\n\nEstimado Cliente, su factura del mes de ${mes} ${anio} está *VENCIDA*.\n\nEl plazo de pago venció el día ${diaVencimiento}. De no regularizar su situación, el servicio será suspendido el día *${nombreDia} ${diaSusp} de ${mes} del ${anio}* a partir de las 10 AM.\n\nFavor realizar su pago a la brevedad posible.\n\nMuchas Gracias!!`;
}

function ColaEnvio({ titulo, clientes, empresaActual, showToast, tipo, diaVencimiento, mensajeCustom, setMensajeCustom }) {
  const [cola, setCola] = useState([]);
  const [activo, setActivo] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const [cargando, setCargando] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [mensajeTemp, setMensajeTemp] = useState('');
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  const hoy = new Date();
  const esVencido = tipo === 'vencido' && hoy.getDate() > diaVencimiento;
  const estadoFiltro = 'Notificado';

  useEffect(() => {
    setMensajeTemp(mensajeCustom || (tipo === 'recordatorio' ? getMensajeRecordatorio(diaVencimiento) : getMensajeVencido(diaVencimiento)));
  }, [mensajeCustom, diaVencimiento]);

  const cargarLista = async () => {
    setCargando(true);
    try {
      const empresa_id = empresaActual?.id || 1;
      const res = await fetch(`/api/recordatorios?empresa_id=${empresa_id}&tipo=${tipo}`);
      const yaEnviados = await res.json();

      const pendientes = (clientes || []).filter(c =>
        c.estado === estadoFiltro &&
        !c.suspendido &&
        !yaEnviados.includes(c.id)
      );

      setCola(pendientes.map(c => ({ ...c, _enviado: false })));
    } catch(e) {
      setCola((clientes || []).filter(c => c.estado === estadoFiltro && !c.suspendido && c.contacto).map(c => ({ ...c, _enviado: false })));
    }
    setCargando(false);
  };

  useEffect(() => { cargarLista(); }, [clientes]);

  useEffect(() => {
    if (!activo) { clearInterval(intervalRef.current); clearInterval(countdownRef.current); return; }
    const pendientes = cola.filter(c => !c._enviado);
    if (pendientes.length === 0) { setActivo(false); return; }
    setCountdown(120);
    enviarMensaje(pendientes[0]);
    countdownRef.current = setInterval(() => setCountdown(prev => prev <= 1 ? 120 : prev - 1), 1000);
    intervalRef.current = setInterval(() => {
      setCola(prev => {
        const pend = prev.filter(c => !c._enviado);
        if (pend.length === 0) { clearInterval(intervalRef.current); clearInterval(countdownRef.current); setActivo(false); showToast('✅ Envíos completados', 'success'); return prev; }
        enviarMensaje(pend[0]); setCountdown(120); return prev;
      });
    }, 120000);
    return () => { clearInterval(intervalRef.current); clearInterval(countdownRef.current); };
  }, [activo]);

  async function enviarMensaje(cliente) {
    try {
      const mensaje = mensajeCustom || (tipo === 'recordatorio' ? getMensajeRecordatorio(diaVencimiento) : getMensajeVencido(diaVencimiento));
      if (window.electronAPI?.whatsappEnviarMensaje) {
        await window.electronAPI.whatsappEnviarMensaje(cliente.contacto, mensaje);
      }
      await fetch('/api/recordatorios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: cliente.id, empresa_id: empresaActual?.id || 1, tipo })
      }).catch(() => {});
      setCola(prev => prev.map(c => c.id === cliente.id ? { ...c, _enviado: true } : c));
      showToast(`✅ Mensaje enviado a ${cliente.nombre}`, 'success');
    } catch(err) {
      showToast(`❌ Error enviando a ${cliente.nombre}`, 'error');
    }
  }

  async function guardarMensaje() {
    setMensajeCustom(mensajeTemp);
    const clave = tipo === 'recordatorio' ? 'mensaje_recordatorio' : 'mensaje_vencido';
    await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave, valor: mensajeTemp }) }).catch(()=>{});
    setShowConfig(false);
    showToast('✅ Mensaje guardado', 'success');
  }

  const pendientes = cola.filter(c => !c._enviado);
  const completados = cola.filter(c => c._enviado);
  const color = tipo === 'recordatorio' ? '#ea580c' : '#dc2626';
  const bgColor = tipo === 'recordatorio' ? '#fff7ed' : '#fef2f2';
  const borderColor = tipo === 'recordatorio' ? '#fed7aa' : '#fca5a5';

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
        <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', margin:0 }}>
          {pendientes.length} pendientes · cada 2 minutos
        </p>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          {activo && <div style={{ fontSize:'12px', color, background:bgColor, border:`1px solid ${borderColor}`, borderRadius:'20px', padding:'4px 12px' }}>⏱ {countdown}s</div>}
          <button onClick={() => setShowConfig(!showConfig)} style={{ padding:'6px 10px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-muted)', cursor:'pointer', fontSize:'12px', display:'flex', alignItems:'center', gap:'4px' }}><Settings size={12}/> Mensaje</button>
          <button onClick={cargarLista} disabled={activo} style={{ padding:'6px 10px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', cursor:'pointer', fontSize:'12px', display:'flex', alignItems:'center', gap:'4px' }}><RefreshCw size={12}/></button>
          <button onClick={() => setActivo(!activo)} disabled={pendientes.length === 0} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', borderRadius:'8px', fontSize:'13px', fontWeight:600, border:'none', cursor: pendientes.length === 0 ? 'not-allowed' : 'pointer', background: activo ? '#ef4444' : color, color:'white', opacity: pendientes.length === 0 ? 0.5 : 1 }}>
            {activo ? <><Pause size={13}/> Pausar</> : <><Play size={13}/> Iniciar</>}
          </button>
        </div>
      </div>

      {showConfig && (
        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'12px', marginBottom:'12px' }}>
          <label style={{ display:'block', fontSize:'11px', fontWeight:600, color:'var(--text-muted)', marginBottom:'6px', textTransform:'uppercase' }}>Mensaje personalizado</label>
          <textarea value={mensajeTemp} onChange={e => setMensajeTemp(e.target.value)} rows={6} style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:'12px', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }}/>
          <div style={{ display:'flex', gap:'8px', marginTop:'8px', justifyContent:'flex-end' }}>
            <button onClick={() => setMensajeTemp(tipo === 'recordatorio' ? getMensajeRecordatorio(diaVencimiento) : getMensajeVencido(diaVencimiento))} style={{ padding:'5px 10px', borderRadius:'6px', border:'1px solid var(--border)', background:'none', color:'var(--text-muted)', fontSize:'12px', cursor:'pointer' }}>Restablecer</button>
            <button onClick={guardarMensaje} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'5px 12px', borderRadius:'6px', background:'#1a1915', color:'white', border:'none', fontSize:'12px', fontWeight:600, cursor:'pointer' }}><Save size={11}/> Guardar</button>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        <div style={{ background:bgColor, border:`1px solid ${borderColor}`, borderRadius:'10px', padding:'12px' }}>
          <div style={{ fontSize:'10px', color, textTransform:'uppercase', marginBottom:'4px' }}>Pendientes</div>
          <div style={{ fontSize:'22px', fontWeight:700, color }}>{pendientes.length}</div>
        </div>
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'12px' }}>
          <div style={{ fontSize:'10px', color:'#16a34a', textTransform:'uppercase', marginBottom:'4px' }}>Enviados</div>
          <div style={{ fontSize:'22px', fontWeight:700, color:'#16a34a' }}>{completados.length}</div>
        </div>
      </div>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
        <div style={{ padding:'8px 16px', background:'var(--surface-2)', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr 120px 100px', gap:'10px' }}>
          <span style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase' }}>Cliente</span>
          <span style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase' }}>Monto</span>
          <span style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase' }}>Estado</span>
        </div>
        {cargando && <div style={{ padding:'30px', textAlign:'center', color:'var(--text-muted)' }}>Cargando...</div>}
        {!cargando && cola.length === 0 && <div style={{ padding:'30px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>No hay clientes {estadoFiltro.toLowerCase()}s</div>}
        {!cargando && cola.map(cliente => (
          <div key={cliente.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 100px', gap:'10px', padding:'10px 16px', borderBottom:'1px solid var(--border)', background: cliente._enviado ? '#f0fdf4' : 'transparent', transition:'all 0.3s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'26px', height:'26px', borderRadius:'50%', background: cliente._enviado ? '#16a34a' : color, display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'10px', fontWeight:700, flexShrink:0 }}>
                {cliente._enviado ? <CheckCircle size={13}/> : (cliente.nombre||'?')[0]}
              </div>
              <div>
                <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text)', textDecoration: cliente._enviado ? 'line-through' : 'none' }}>{cliente.nombre}</div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{cliente.contacto}</div>
              </div>
            </div>
            <div style={{ fontSize:'12px', color:'var(--text)', display:'flex', alignItems:'center', fontFamily:'monospace' }}>${parseFloat(cliente.monto||0).toLocaleString('en-US',{minimumFractionDigits:2})}</div>
            <div style={{ display:'flex', alignItems:'center' }}>
              <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', fontWeight:600, background: cliente._enviado ? '#dcfce7' : bgColor, color: cliente._enviado ? '#16a34a' : color }}>
                {cliente._enviado ? '✓ Enviado' : estadoFiltro}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TabRecordatorio({ clientes, showToast, empresaActual, diaVencimiento, setDiaVencimiento, mensajeRecordatorio, setMensajeRecordatorio }) {
  const [subTab, setSubTab] = useState('recordatorio');
  const [diaTemp, setDiaTemp] = useState(diaVencimiento || 15);
  const [showDiaConfig, setShowDiaConfig] = useState(false);
  const [mensajeVencido, setMensajeVencido] = useState('');

  async function guardarDia() {
    setDiaVencimiento(diaTemp);
    await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave:'dia_vencimiento', valor: String(diaTemp) }) }).catch(()=>{});
    setShowDiaConfig(false);
    showToast('✅ Día de vencimiento guardado', 'success');
  }

  return (
    <div style={{ padding:'1.5rem', maxWidth:'900px', margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
        <div>
          <h2 style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--text)', margin:0 }}>Gestión de Cobro</h2>
          <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', margin:'4px 0 0' }}>Día de vencimiento: <strong>{diaVencimiento || 15}</strong> de cada mes</p>
        </div>
        <button onClick={() => setShowDiaConfig(!showDiaConfig)} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 12px', borderRadius:'8px', fontSize:'12px', fontWeight:600, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', cursor:'pointer' }}>
          <Settings size={13}/> Día vencimiento
        </button>
      </div>

      {showDiaConfig && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', padding:'14px', marginBottom:'16px', display:'flex', alignItems:'center', gap:'12px' }}>
          <label style={{ fontSize:'13px', color:'var(--text)', fontWeight:600 }}>Día de vencimiento:</label>
          <input type="number" min="1" max="31" value={diaTemp} onChange={e => setDiaTemp(parseInt(e.target.value)||15)} style={{ width:'70px', padding:'6px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:'14px', textAlign:'center' }}/>
          <button onClick={guardarDia} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'6px 14px', borderRadius:'6px', background:'#1a1915', color:'white', border:'none', fontSize:'12px', fontWeight:600, cursor:'pointer' }}><Save size={11}/> Guardar</button>
        </div>
      )}

      {/* Sub tabs */}
      <div style={{ display:'flex', gap:'4px', background:'var(--surface-2)', borderRadius:'10px', padding:'4px', marginBottom:'16px' }}>
        <button onClick={() => setSubTab('recordatorio')} style={{ flex:1, padding:'8px', borderRadius:'7px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight: subTab==='recordatorio' ? 700 : 400, background: subTab==='recordatorio' ? '#ea580c' : 'transparent', color: subTab==='recordatorio' ? 'white' : 'var(--text-muted)', transition:'all 0.15s' }}>
          📋 Recordatorio — Notificados
        </button>
        <button onClick={() => setSubTab('vencido')} style={{ flex:1, padding:'8px', borderRadius:'7px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight: subTab==='vencido' ? 700 : 400, background: subTab==='vencido' ? '#dc2626' : 'transparent', color: subTab==='vencido' ? 'white' : 'var(--text-muted)', transition:'all 0.15s' }}>
          🚨 Vencidos — Suspensión
        </button>
      </div>

      {subTab === 'recordatorio' && (
        <ColaEnvio tipo="recordatorio" titulo="Recordatorio" clientes={clientes} empresaActual={empresaActual} showToast={showToast} diaVencimiento={diaVencimiento||15} mensajeCustom={mensajeRecordatorio} setMensajeCustom={setMensajeRecordatorio}/>
      )}
      {subTab === 'vencido' && (
        <ColaEnvio tipo="vencido" titulo="Vencidos" clientes={clientes} empresaActual={empresaActual} showToast={showToast} diaVencimiento={diaVencimiento||15} mensajeCustom={mensajeVencido} setMensajeCustom={setMensajeVencido}/>
      )}
    </div>
  );
}
