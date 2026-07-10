'use client';
import { useState, useEffect, useRef } from 'react';
import { Phone, Send } from 'lucide-react';

export default function TabRecarga({ clientes, empresaActual, showToast }) {
  const [recargas, setRecargas] = useState([]);
  const [telRecarga, setTelRecarga] = useState('');
  const [showConfigTel, setShowConfigTel] = useState(false);
  const [masivoActivo, setMasivoActivo] = useState(false);
  const [masivoIndex, setMasivoIndex] = useState(0);
  const [masivoCountdown, setMasivoCountdown] = useState(0);
  const [masivoEnviados, setMasivoEnviados] = useState(0);
  const [masivoQueue, setMasivoQueue] = useState([]);
  const [masivoActualId, setMasivoActualId] = useState(null);
  const empresaId = empresaActual?.id;
  const mesActual = new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

  const clientesRecarga = clientes.filter(c => c.generaRecarga);

  const cargar = async () => {
    if (!empresaId) return;
    const res = await fetch('/api/recargas?empresa_id=' + empresaId + '&mes=' + encodeURIComponent(mesActual));
    if (res.ok) setRecargas(await res.json());
  };

  useEffect(() => {
    cargar();
    setTelRecarga(localStorage.getItem('recarga_telefono') || '');
  }, [empresaId]);

  const [masivoTargetTime, setMasivoTargetTime] = useState(null);
  const enviandoRef = useRef(false);

  useEffect(() => {
    if (!masivoActivo || !masivoTargetTime) return;
    const tick = setInterval(() => {
      const restante = Math.ceil((masivoTargetTime - Date.now()) / 1000);
      if (restante <= 0) {
        if (enviandoRef.current) return;
        enviandoRef.current = true;
        setMasivoCountdown(0);
        enviarMasivoActual().finally(() => { enviandoRef.current = false; });
      } else {
        setMasivoCountdown(restante);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [masivoActivo, masivoTargetTime]);

  const randomCountdown = () => Math.floor(Math.random() * (120 - 20 + 1)) + 20;

  const iniciarMasivo = () => {
    const cola = clientesRecarga.filter(c => {
      if (!c.contacto) return false;
      const rec = getRecarga(c.id);
      if (rec?.aplicar_a === 'recarga') return false;
      if ((rec?.comision || 0) <= 0) return false;
      return true;
    });
    if (cola.length === 0) { showToast && showToast('No hay clientes con comision registrada para notificar', 'error'); return; }
    setMasivoQueue(cola);
    setMasivoIndex(0);
    setMasivoEnviados(0);
    setMasivoActualId(cola[0].id);
    setMasivoCountdown(randomCountdown());
    setMasivoActivo(true);
  };

  const enviarMasivoActual = async () => {
    console.log('[Recarga Masivo] Ejecutando envio para index', masivoIndex);
    const cliente = masivoQueue[masivoIndex];
    if (!cliente) { setMasivoActivo(false); return; }
    const rec = getRecarga(cliente.id);
    const comision = rec?.comision || 0;
    const servicio = parseFloat(cliente.monto || 0);
    const diferencia = servicio - comision;
    let msg;
    if (diferencia <= 0) {
      msg = 'Saludos ' + cliente.nombre + ', le informamos que sus comisiones de recarga saldaron el pago de su servicio.';
    } else {
      msg = 'Saludos ' + cliente.nombre + ', su comision de recarga generada fue de RD$' + comision.toLocaleString('en-US') + '. Su diferencia a pagar por servicio es de RD$' + diferencia.toLocaleString('en-US') + '.';
    }
    if (window.electronAPI?.whatsappEnviarMensaje && cliente.contacto) {
      try {
        await Promise.race([
          window.electronAPI.whatsappEnviarMensaje(cliente.contacto, msg),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
        ]);
      } catch (err) {
        console.warn('[Recarga Masivo] Error o timeout enviando a', cliente.nombre, err);
      }
    }
    // Marcar notificado
    if (rec) {
      const res = await fetch('/api/recargas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rec.id, notificado: true }) });
      if (res.ok) { const data = await res.json(); setRecargas(prev => prev.map(r => r.id === data.id ? data : r)); }
    } else {
      const res = await fetch('/api/recargas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: cliente.id, empresa_id: empresaId, mes: mesActual, comision: 0, monto_servicio: servicio, notificado: true }) });
      if (res.ok) { const data = await res.json(); setRecargas(prev => [...prev, data]); }
    }
    setMasivoEnviados(prev => prev + 1);
    const siguienteIndex = masivoIndex + 1;
    if (siguienteIndex >= masivoQueue.length) {
      setMasivoActivo(false);
      setMasivoActualId(null);
      showToast && showToast(masivoQueue.length + ' clientes notificados', 'success');
      return;
    }
    setMasivoIndex(siguienteIndex);
    setMasivoActualId(masivoQueue[siguienteIndex].id);
    setMasivoCountdown(randomCountdown());
  };

  const getRecarga = (clienteId) => recargas.find(r => r.cliente_id === clienteId);

  const cambiarAplicarA = async (cliente, valor) => {
    const existente = getRecarga(cliente.id);
    if (existente) {
      const res = await fetch('/api/recargas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: existente.id, aplicar_a: valor }) });
      if (res.ok) { const data = await res.json(); setRecargas(prev => prev.map(r => r.id === data.id ? data : r)); }
    } else {
      const res = await fetch('/api/recargas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: cliente.id, empresa_id: empresaId, mes: mesActual, comision: 0, monto_servicio: parseFloat(cliente.monto||0), aplicar_a: valor }) });
      if (res.ok) { const data = await res.json(); setRecargas(prev => [...prev, data]); }
    }
  };

  const actualizarComision = async (cliente, comision) => {
    const existente = getRecarga(cliente.id);
    const montoServicio = parseFloat(cliente.monto || 0);
    if (existente) {
      const res = await fetch('/api/recargas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existente.id, comision, monto_servicio: montoServicio })
      });
      if (res.ok) {
        const data = await res.json();
        setRecargas(prev => prev.map(r => r.id === data.id ? data : r));
      }
    } else {
      const res = await fetch('/api/recargas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: cliente.id, empresa_id: empresaId, mes: mesActual, comision, monto_servicio: montoServicio })
      });
      if (res.ok) {
        const data = await res.json();
        setRecargas(prev => [...prev, data]);
      }
    }
  };

  const notificarCliente = (cliente) => {
    const rec = getRecarga(cliente.id);
    if (rec?.aplicar_a === 'recarga') { showToast && showToast('Este cliente aplica a recarga, no se notifica', 'error'); return; }
    const comision = rec?.comision || 0;
    if (comision <= 0) { showToast && showToast('Sin comision de recarga registrada este mes', 'error'); return; }
    const servicio = parseFloat(cliente.monto || 0);
    const diferencia = servicio - comision;
    let msg;
    if (diferencia <= 0) {
      msg = 'Saludos ' + cliente.nombre + ', le informamos que sus comisiones de recarga saldaron el pago de su servicio.';
    } else {
      msg = 'Saludos ' + cliente.nombre + ', su comision de recarga generada fue de RD$' + comision.toLocaleString('en-US') + '. Su diferencia a pagar por servicio es de RD$' + diferencia.toLocaleString('en-US') + '.';
    }
    if (window.electronAPI?.whatsappEnviarMensaje && cliente.contacto) {
      window.electronAPI.whatsappEnviarMensaje(cliente.contacto, msg).then(() => showToast && showToast('Mensaje enviado', 'success')).catch(() => showToast && showToast('Error al enviar', 'error'));
    } else {
      showToast && showToast('Sin contacto o WhatsApp no conectado', 'error');
    }
  };

  const enviarMontosGenerados = () => {
    if (!telRecarga) { setShowConfigTel(true); return; }
    let msg = 'Saludos, buenas tardes.\n\nEstos son los montos de servicio generado este mes:\n\n';
    clientesRecarga.forEach(c => {
      msg += '• ' + c.nombre + ': RD$' + parseFloat(c.monto || 0).toLocaleString('en-US') + '\n';
    });
    const num = telRecarga.replace(/\D/g, '');
    window.open('whatsapp://send?phone=' + num + '&text=' + encodeURIComponent(msg), '_blank');
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:700, color:'#1a1915', letterSpacing:'-0.03em' }}>Recarga</div>
          <div style={{ fontSize:'13px', color:'#9a998f', marginTop:'3px' }}>{mesActual} · {clientesRecarga.length} clientes activos</div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => setShowConfigTel(true)} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'12px', fontWeight:600, border:'1px solid #e0dfd8', background:'#faf9f5', color:'#6b6a62', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
            <Phone size={13}/> Tel. Recarga
          </button>
          <button onClick={enviarMontosGenerados} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'13px', fontWeight:700, border:'none', background:'#378ADD', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
            <Send size={13}/> Enviar montos generados
          </button>
          <button onClick={iniciarMasivo} disabled={masivoActivo} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'13px', fontWeight:700, border:'none', background: masivoActivo ? '#94a3b8' : '#25D366', color:'#fff', cursor: masivoActivo ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
            <Send size={13}/> {masivoActivo ? 'Notificando (' + masivoEnviados + '/' + masivoQueue.length + ')' : 'Notificar masivo'}
          </button>
        </div>
      </div>

      {clientesRecarga.length === 0 && (
        <div style={{ textAlign:'center', color:'#9a998f', padding:'3rem', background:'#fff', borderRadius:'12px', border:'1px solid #e0dfd8' }}>
          No hay clientes marcados para recarga. Actívalo en Cartera al editar un cliente.
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'12px' }}>
        {clientesRecarga.map(c => {
          const rec = getRecarga(c.id);
          const comision = rec?.comision || 0;
          const servicio = parseFloat(c.monto || 0);
          const diferencia = servicio - comision;
          const saldado = diferencia <= 0;
          const enCola = masivoActivo && masivoActualId === c.id;
          const yaNotificado = rec?.notificado;
          return (
            <div key={c.id} style={{ background:'#fff', border: enCola ? '1.5px solid #25D366' : '1px solid #e0dfd8', borderRadius:'12px', padding:'14px 16px', position:'relative', overflow:'hidden', borderLeft: '3px solid ' + (yaNotificado ? '#378ADD' : saldado ? '#16a34a' : '#dc2626') }}>
              {enCola && (
                <div style={{ background:'#dcfce7', color:'#14532d', fontSize:'11px', fontWeight:700, borderRadius:'8px', padding:'6px 10px', marginBottom:'10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span>Proxima notificacion</span>
                  <span>{Math.floor(masivoCountdown/60)}:{String(masivoCountdown%60).padStart(2,'0')}</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'#E6F1FB', color:'#185FA5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:600 }}>
                  {c.nombre.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                </div>
                <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', fontWeight:600, background: yaNotificado ? '#E6F1FB' : saldado ? '#dcfce7' : '#fee2e2', color: yaNotificado ? '#185FA5' : saldado ? '#14532d' : '#991b1b' }}>
                  {yaNotificado ? 'Notificado' : saldado ? 'Saldado' : 'Pendiente'}
                </span>
              </div>
              <div style={{ fontSize:'14px', fontWeight:600, color:'#1a1915', marginBottom:'10px' }}>{c.nombre}</div>
              <div style={{ display:'flex', background:'#f5f4ef', borderRadius:'8px', padding:'3px', marginBottom:'10px' }}>
                <div onClick={() => cambiarAplicarA(c, 'servicio')} style={{ flex:1, textAlign:'center', padding:'6px', fontSize:'11px', fontWeight:600, borderRadius:'6px', cursor:'pointer', background: (rec?.aplicar_a || 'servicio') === 'servicio' ? '#378ADD' : 'transparent', color: (rec?.aplicar_a || 'servicio') === 'servicio' ? '#fff' : '#9a998f' }}>Servicio</div>
                <div onClick={() => cambiarAplicarA(c, 'recarga')} style={{ flex:1, textAlign:'center', padding:'6px', fontSize:'11px', fontWeight:600, borderRadius:'6px', cursor:'pointer', background: rec?.aplicar_a === 'recarga' ? '#378ADD' : 'transparent', color: rec?.aplicar_a === 'recarga' ? '#fff' : '#9a998f' }}>Recarga</div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                <span style={{ fontSize:'11px', color:'#9a998f' }}>Servicio</span>
                <span style={{ fontSize:'13px', color:'#1a1915' }}>RD$ {servicio.toLocaleString('en-US')}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                <span style={{ fontSize:'11px', color:'#9a998f' }}>Comision recarga</span>
                <input key={c.id + "-" + comision} type="number" defaultValue={comision} onBlur={e => actualizarComision(c, Number(e.target.value))} style={{ width:'80px', padding:'4px 8px', border:'1px solid #e0dfd8', borderRadius:'6px', fontSize:'12px', textAlign:'right' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:'8px', marginTop:'4px', borderTop:'1px solid #f5f4ef' }}>
                <span style={{ fontSize:'11px', color:'#9a998f' }}>Diferencia a pagar</span>
                <span style={{ fontSize:'16px', fontWeight:700, color: saldado ? '#16a34a' : '#dc2626' }}>RD$ {Math.max(0, diferencia).toLocaleString('en-US')}</span>
              </div>
              <button onClick={() => notificarCliente(c)} style={{ width:'100%', marginTop:'10px', background:'none', border:'1px solid #e0dfd8', borderRadius:'8px', padding:'6px', fontSize:'12px', color:'#378ADD', cursor:'pointer', fontWeight:600 }}>
                Notificar cliente
              </button>
            </div>
          );
        })}
      </div>

      {showConfigTel && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowConfigTel(false); }}>
          <div className="modal-content" style={{ maxWidth: '340px' }}>
            <h2>Telefono Departamento Recarga</h2>
            <div className="form-group">
              <label>Numero de WhatsApp</label>
              <input type="tel" value={telRecarga} onChange={e => setTelRecarga(e.target.value)} placeholder="Ej: 18091234567"/>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfigTel(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { localStorage.setItem('recarga_telefono', telRecarga); setShowConfigTel(false); if(showToast) showToast('Telefono guardado', 'success'); }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
