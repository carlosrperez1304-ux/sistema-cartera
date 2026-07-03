'use client';
import { useState } from 'react';
import { MessageSquare } from 'lucide-react';

export default function CentroNotificaciones({ clientes, creditos, showToast }) {
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [cliente, setCliente] = useState(null);
  const [deuda, setDeuda] = useState(null);
  const [plantilla, setPlantilla] = useState(0);

  const clientesFiltrados = buscar.length > 1
    ? clientes.filter(c => c.nombre.toLowerCase().includes(buscar.toLowerCase())).slice(0, 6)
    : [];

  const deudas = cliente ? [
    ...creditos.filter(cr => cr.cliente === cliente.nombre).map(cr => ({
      label: 'Credito #' + cr.numeroOrden,
      monto: parseFloat(cr.monto || 0),
      fecha: cr.fechaVencimiento,
      dias: Math.round((new Date(cr.fechaVencimiento) - new Date()) / (1000*60*60*24)),
    })),
    ...(parseFloat(cliente.monto || 0) > 0 ? [{
      label: 'Servicio mensual',
      monto: parseFloat(cliente.monto || 0),
      fecha: null,
      dias: null,
    }] : []),
  ] : [];

  const plantillas = [
    { label: 'Recordatorio de vencimiento', icon: '⚠️' },
    { label: 'Credito vencido', icon: '🚨' },
    { label: 'Confirmacion de pago', icon: '✅' },
  ];

  const nl = '\n';
  const getMensaje = () => {
    if (!cliente || !deuda) return '';
    const nombre = cliente.nombre;
    const monto = '$' + deuda.monto.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const fecha = deuda.fecha ? new Date(deuda.fecha).toLocaleDateString('es-DO') : '';
    const dias = deuda.dias !== null ? Math.abs(deuda.dias) : 0;
    if (plantilla === 0) return '⚠️ *Recordatorio*' + nl + nl + 'Estimado ' + nombre + ', su credito por ' + monto + ' vence en ' + dias + ' dias, el ' + fecha + '. Por favor realice su pago a tiempo.';
    if (plantilla === 1) return '🚨 *Credito vencido*' + nl + nl + 'Estimado ' + nombre + ', su credito por ' + monto + ' vencio el ' + fecha + '. Por favor realice su pago lo mas pronto posible.';
    return '✅ *Pago confirmado*' + nl + nl + 'Estimado ' + nombre + ', confirmamos su pago por ' + monto + '. Gracias por su puntualidad.';
  };

  const enviar = async () => {
    if (!cliente || !deuda) return;
    const msg = getMensaje();
    if (!cliente.contacto) { showToast('El cliente no tiene contacto', 'error'); return; }
    if (!window.electronAPI?.whatsappEnviarMensaje) { showToast('WhatsApp no conectado', 'error'); return; }
    try {
      await window.electronAPI.whatsappEnviarMensaje(cliente.contacto, msg);
      showToast('Mensaje enviado', 'success');
    } catch { showToast('Error al enviar', 'error'); }
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', marginBottom: '1rem' }}>
      <div onClick={() => setAbierto(!abierto)} style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: abierto ? '1rem' : 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
        <MessageSquare size={16} /> Centro de Notificaciones
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>{abierto ? '▲' : '▼'}</span>
      </div>
      {abierto && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Buscar cliente</div>
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <input type='text' placeholder='Nombre del cliente...' value={buscar} onChange={e => { setBuscar(e.target.value); setCliente(null); setDeuda(null); }} style={{ width: '100%', padding: '8px 12px', border: '0.5px solid var(--border-strong)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface-2)', color: 'var(--text)', boxSizing: 'border-box' }} />
            {clientesFiltrados.length > 0 && !cliente && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: '8px', zIndex: 10, maxHeight: '160px', overflowY: 'auto' }}>
                {clientesFiltrados.map(c => (
                  <div key={c.id} onClick={() => { setCliente(c); setBuscar(c.nombre); setDeuda(null); }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', borderBottom: '0.5px solid var(--border)', color: 'var(--text)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {c.nombre} {c.contacto && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>- {c.contacto}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {cliente && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: '8px', border: '0.5px solid var(--border)', marginBottom: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 500, color: '#185FA5', flexShrink: 0 }}>
                {cliente.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{cliente.nombre}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cliente.contacto || 'Sin contacto'}</div>
              </div>
            </div>
          )}
          {deudas.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Deudas del cliente</div>
              {deudas.map((d, i) => (
                <div key={i} onClick={() => setDeuda(d)} style={{ padding: '8px 12px', borderRadius: '8px', border: '0.5px solid ' + (deuda === d ? '#378ADD' : 'var(--border)'), background: deuda === d ? '#E6F1FB' : 'transparent', cursor: 'pointer', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>{d.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#E24B4A' }}>${d.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {d.fecha && <div style={{ fontSize: '11px', color: d.dias < 0 ? '#E24B4A' : 'var(--text-muted)', marginTop: '2px' }}>Vence: {new Date(d.fecha).toLocaleDateString('es-DO')} - {d.dias < 0 ? Math.abs(d.dias) + ' dias vencido' : d.dias + ' dias restantes'}</div>}
                </div>
              ))}
            </div>
          )}
          {cliente && deudas.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px' }}>Sin deudas activas</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Plantilla</div>
          {plantillas.map((p, i) => (
            <div key={i} onClick={() => setPlantilla(i)} style={{ padding: '8px 12px', borderRadius: '8px', border: '0.5px solid ' + (plantilla === i ? '#378ADD' : 'var(--border)'), background: plantilla === i ? '#E6F1FB' : 'transparent', cursor: 'pointer', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{p.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>{p.label}</span>
            </div>
          ))}
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 0 6px' }}>Vista previa</div>
          <div style={{ background: '#e5ddd5', borderRadius: '8px', padding: '10px', marginBottom: '10px', minHeight: '80px' }}>
            <div style={{ background: 'white', borderRadius: '0 8px 8px 8px', padding: '8px 10px', fontSize: '12px', color: '#111', lineHeight: 1.5 }}>
              {cliente && deuda
                ? getMensaje().split(nl).map((line, i) => <span key={i}>{line}<br /></span>)
                : <span style={{ color: '#999', fontSize: '11px' }}>Selecciona un cliente y una deuda</span>}
            </div>
          </div>
          <button onClick={enviar} disabled={!cliente || !deuda} style={{ width: '100%', background: (!cliente || !deuda) ? 'var(--border)' : '#25D366', color: 'white', border: 'none', borderRadius: '8px', padding: '9px', fontSize: '13px', fontWeight: 500, cursor: (!cliente || !deuda) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <MessageSquare size={14} /> Enviar por WhatsApp
          </button>
        </div>
      </div>}
    </div>
  );
}
