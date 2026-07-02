'use client';
import { Pencil, Trash2, CheckCircle, Send } from 'lucide-react';

export default function CreditoCard({ credito, clientes, editingCreditoMontoId, tempCreditoMonto, setTempCreditoMonto, guardarCreditoMontoInline, cancelarEdicionCreditoMonto, iniciarEdicionCreditoMonto, calcularSaldosCredito, getDiasRestantes, abrirCreditoModal, eliminarCredito, actualizarCredito }) {
  const diasRestantes = getDiasRestantes(credito.fechaVencimiento);
  const vencido = diasRestantes < 0;
  const diasAbs = Math.abs(diasRestantes);
  const s = calcularSaldosCredito(credito.monto, credito.abonos || []);
  const pct = s.total > 0 ? Math.min((s.abonado / s.total) * 100, 100) : 0;
  const initials = (credito.cliente || '??').split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase() || '??';
  const estadoColor = (credito.estado === 'Vencido' || vencido) ? '#E24B4A' : credito.estado === 'Pagado' ? '#639922' : credito.estado === 'Por Vencer' ? '#BA7517' : '#378ADD';
  const estadoBg   = (credito.estado === 'Vencido' || vencido) ? '#FCEBEB' : credito.estado === 'Pagado' ? '#EAF3DE' : credito.estado === 'Por Vencer' ? '#FAEEDA' : '#E6F1FB';
  const estadoText = (credito.estado === 'Vencido' || vencido) ? '#A32D2D' : credito.estado === 'Pagado' ? '#3B6D11' : credito.estado === 'Por Vencer' ? '#854F0B' : '#185FA5';

  const notificar = async () => {
    const diasR = Math.round((new Date(credito.fechaVencimiento) - new Date()) / (1000*60*60*24));
    const monto = "$" + parseFloat(credito.monto||0).toLocaleString('en-US',{minimumFractionDigits:2});
    const fechaVenc = new Date(credito.fechaVencimiento).toLocaleDateString('es-DO');
    const esVencido = diasR < 0;
    const dAbs = Math.abs(diasR);
    const clienteObj = clientes.find(c => c.nombre === credito.cliente);
    if (clienteObj?.contacto && window.electronAPI?.whatsappEnviarMensaje) {
      const msgCliente = esVencido
        ? "Estimado " + credito.cliente + ", le informamos que su crédito (Orden: " + credito.numeroOrden + ") por " + monto + " venció el " + fechaVenc + ", hace " + dAbs + " días. Por favor realice su pago lo más pronto posible."
        : "Estimado " + credito.cliente + ", le recordamos que su crédito (Orden: " + credito.numeroOrden + ") por " + monto + " vence en " + dAbs + " días, el " + fechaVenc + ". Por favor realice su pago a tiempo.";
      await window.electronAPI.whatsappEnviarMensaje(clienteObj.contacto, msgCliente).catch(()=>{});
    }
    if (credito.vendedor_whatsapp && window.electronAPI?.whatsappEnviarMensaje) {
      const msgVendedor = "Estimado " + credito.vendedor + ", le informamos que el crédito del cliente *" + credito.cliente + "* (Orden: " + credito.numeroOrden + ") por " + monto + " se encuentra *" + (esVencido ? 'VENCIDO' : 'POR VENCER') + "*.\n📅 Fecha de vencimiento: " + fechaVenc + "\n" + (esVencido ? "⚠️ Días vencido: " + dAbs : "⏳ Días restantes: " + dAbs);
      await window.electronAPI.whatsappEnviarMensaje(credito.vendedor_whatsapp, msgVendedor).catch(()=>{});
    }
  };

  return (
    <div style={{ background:'var(--surface-2)', border:'0.5px solid var(--border)', borderRadius:'12px', padding:'14px 18px', display:'flex', alignItems:'center', gap:'14px', borderLeft:'4px solid ' + estadoColor }}>
      <div style={{ width:'42px', height:'42px', borderRadius:'50%', background:estadoBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:500, color:estadoText, flexShrink:0 }}>{initials}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'14px', fontWeight:500, color:'var(--text-primary)', marginBottom:'2px' }}>{credito.cliente}</div>
        <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'6px' }}>Orden: {credito.numeroOrden} · {credito.vendedor ? 'Vendedor: ' + credito.vendedor : 'Sin vendedor'}</div>
        <div style={{ display:'flex', gap:'14px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>Inicio: {new Date(credito.fechaInicio).toLocaleDateString('es-DO')}</span>
          <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>Plazo: {credito.plazoMeses?.endsWith('d') ? credito.plazoMeses.replace('d','') + ' días' : credito.plazoMeses + ' ' + (credito.plazoMeses === '1' ? 'mes' : 'meses')}</span>
          <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>Vence: {new Date(credito.fechaVencimiento).toLocaleDateString('es-DO')}</span>
          {credito.estado !== 'Pagado' && <span style={{ fontSize:'11px', fontWeight:500, color:estadoText }}>{vencido ? diasAbs + ' días vencido' : diasAbs + ' días restantes'}</span>}
        </div>
        {s.total > 0 && <div style={{ marginTop:'6px' }}><div style={{ height:'3px', background:'var(--border)', borderRadius:'2px', overflow:'hidden' }}><div style={{ height:'100%', width:pct+'%', background:pct>=100?'#639922':'#378ADD', borderRadius:'2px' }}></div></div></div>}
      </div>
      <div style={{ textAlign:'right', marginRight:'10px', flexShrink:0 }}>
        <div style={{ fontSize:'16px', fontWeight:500, color:'var(--text-primary)' }}>
          {editingCreditoMontoId === credito.id ? (
            <input type="text" inputMode="decimal" value={tempCreditoMonto} onChange={e => setTempCreditoMonto(e.target.value)} onBlur={() => guardarCreditoMontoInline(credito.id)} onKeyDown={e => { if(e.key==='Enter'){e.preventDefault();guardarCreditoMontoInline(credito.id);}else if(e.key==='Escape')cancelarEdicionCreditoMonto(); }} autoFocus style={{ width:'100px', padding:'0.3rem', border:'2px solid #0ea5e9', borderRadius:'6px', fontWeight:700, textAlign:'right' }} />
          ) : (
            <span onClick={() => iniciarEdicionCreditoMonto(credito)} style={{ cursor:'pointer' }} title="Click para editar">${parseFloat(credito.monto||0).toLocaleString()}</span>
          )}
        </div>
        <div style={{ fontSize:'11px', color:s.pendiente>0?'#BA7517':'#639922', marginTop:'2px' }}>Saldo: ${s.pendiente.toFixed(2)}</div>
      </div>
      <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:500, background:estadoBg, color:estadoText, flexShrink:0 }}>{credito.estado}</span>
      <div style={{ display:'flex', flexDirection:'column', gap:'5px', flexShrink:0 }}>
        {credito.vendedor_whatsapp && (
          <button onClick={notificar} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'6px', border:'none', background:'#25D366', color:'white', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
            <Send size={11}/> Notificar
          </button>
        )}
        <button onClick={() => abrirCreditoModal(credito)} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'6px', border:'0.5px solid var(--border-strong)', background:'none', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
          <Pencil size={11}/> Editar
        </button>
        {credito.estado !== 'Pagado' && (
          <button onClick={() => { const a = { ...credito, estado:'Pagado', historial:[...(credito.historial||[]),{fecha:new Date().toISOString(),accion:'Marcado como Pagado'}] }; actualizarCredito(a); }} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'6px', border:'none', background:'var(--bg-success)', color:'var(--text-success)', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
            <CheckCircle size={11}/> Pagado
          </button>
        )}
        <button onClick={() => eliminarCredito(credito.id)} style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'6px', border:'none', background:'var(--bg-danger)', color:'var(--text-danger)', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
          <Trash2 size={11}/>
        </button>
      </div>
    </div>
  );
}
