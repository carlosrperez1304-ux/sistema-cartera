'use client';
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, MessageCircle, FileUp, X, Check } from 'lucide-react';

function EditableContacto({ sg, onSave }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(sg.contacto || '');

  if (editando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          value={valor}
          onChange={e => setValor(e.target.value)}
          placeholder="Número"
          autoFocus
          style={{ width: '110px', padding: '2px 6px', fontSize: '11px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(valor); setEditando(false); } if (e.key === 'Escape') setEditando(false); }}
        />
        <button onClick={() => { onSave(valor); setEditando(false); }} style={{ padding: '2px 5px', fontSize: '10px', borderRadius: '4px', background: '#16a34a', color: 'white', border: 'none', cursor: 'pointer' }}>✓</button>
        <button onClick={() => setEditando(false)} style={{ padding: '2px 5px', fontSize: '10px', borderRadius: '4px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
      </div>
    );
  }

  return (
    <div onClick={() => setEditando(true)} style={{ fontSize: '11px', color: sg.contacto ? 'var(--text-muted)' : '#ea580c', cursor: 'pointer', borderBottom: '1px dashed var(--border)' }} title="Clic para editar contacto">
      {sg.contacto || 'Sin contacto'} · {sg.pdf_nombre ? '📎 PDF' : 'Sin PDF'}
    </div>
  );
}

const ESTADOS = ['Pendiente', 'Cotizado', 'Notificado', 'Pagado'];
const ESTADO_COLORS = {
  Pendiente: { bg: '#fef2f2', color: '#dc2626' },
  Cotizado:  { bg: '#fff7ed', color: '#ea580c' },
  Notificado:{ bg: '#eff6ff', color: '#2563eb' },
  Pagado:    { bg: '#f0fdf4', color: '#16a34a' },
};

export default function SubgruposCliente({ cliente, empresaActual, showToast }) {
  const [expandido, setExpandido] = useState(false);
  const [subgrupos, setSubgrupos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoContacto, setNuevoContacto] = useState('');
  const [nuevoMonto, setNuevoMonto] = useState('');

  useEffect(() => {
    if (expandido) cargarSubgrupos();
  }, [expandido]);

  async function cargarSubgrupos() {
    setCargando(true);
    try {
      const res = await fetch(`/api/subgrupos?cliente_id=${cliente.id}`);
      const data = await res.json();
      setSubgrupos(data);
    } catch(e) {}
    setCargando(false);
  }

  async function agregarSubgrupo() {
    if (!nuevoNombre.trim()) return;
    try {
      const res = await fetch('/api/subgrupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: cliente.id,
          nombre: nuevoNombre.trim(),
          contacto: nuevoContacto.trim(),
          monto: parseFloat(nuevoMonto) || 0,
          empresa_id: empresaActual?.id || 1
        })
      });
      const data = await res.json();
      setSubgrupos(prev => [...prev, data]);
      setNuevoNombre(''); setNuevoContacto(''); setNuevoMonto('');
      setAgregando(false);
      showToast('Subgrupo agregado', 'success');
    } catch(e) { showToast('Error al agregar', 'error'); }
  }

  async function cambiarEstado(sg, estado) {
    const hoy = new Date().toISOString().split('T')[0];
    const updates = { id: sg.id, estado };
    if (estado === 'Cotizado') updates.fecha_cotizacion = hoy;
    if (estado === 'Notificado') updates.fecha_notificacion = hoy;
    if (estado === 'Pagado') updates.fecha_pago = hoy;
    try {
      const res = await fetch('/api/subgrupos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
      const data = await res.json();
      setSubgrupos(prev => prev.map(s => s.id === sg.id ? data : s));
    } catch(e) {}
  }

  async function eliminarSubgrupo(id) {
    if (!confirm('¿Eliminar este subgrupo?')) return;
    await fetch(`/api/subgrupos?id=${id}`, { method: 'DELETE' });
    setSubgrupos(prev => prev.filter(s => s.id !== id));
    showToast('Subgrupo eliminado', 'success');
  }

  async function subirPDF(sg) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.pdf';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result;
        try {
          const res = await fetch('/api/subgrupos', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: sg.id, pdf_nombre: file.name, pdf_base64: base64, estado: 'Cotizado', fecha_cotizacion: new Date().toISOString().split('T')[0] })
          });
          const data = await res.json();
          setSubgrupos(prev => prev.map(s => s.id === sg.id ? data : s));
          showToast('PDF subido', 'success');
        } catch(e) { showToast('Error al subir PDF', 'error'); }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function enviarWhatsApp(sg) {
    const contacto = sg.contacto || cliente.contacto;
    if (!contacto) { showToast('Sin número de contacto', 'error'); return; }
    if (!window.electronAPI?.whatsappEnviarMensaje) { showToast('WhatsApp no disponible', 'error'); return; }
    const hora = new Date().getHours();
    const saludo = hora >= 5 && hora < 12 ? 'Buenos días' : hora >= 12 && hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    const monto = `$${parseFloat(sg.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const mensaje = `Saludos ${saludo}!\nLe informamos sobre el subgrupo *${sg.nombre}* correspondiente al cliente ${cliente.nombre}.\n💰 Monto: ${monto}\n📋 Estado: ${sg.estado}`;
    try {
      await window.electronAPI.whatsappEnviarMensaje(contacto, mensaje);
      await cambiarEstado(sg, 'Notificado');
      showToast(`Mensaje enviado a ${sg.nombre}`, 'success');
    } catch(e) { showToast('Error al enviar', 'error'); }
  }

  const tieneSubgrupos = subgrupos.length > 0;

  return (
    <div>
      <button
        onClick={() => setExpandido(!expandido)}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '12px' }}
        title={expandido ? 'Ocultar subgrupos' : 'Ver subgrupos'}
      >
        {expandido ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
        {tieneSubgrupos || expandido ? `${subgrupos.length} sub` : 'Sub'}
      </button>

      {expandido && (
        <div style={{ marginTop: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {cargando && <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Cargando...</div>}

          {!cargando && subgrupos.map(sg => (
            <div key={sg.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{sg.nombre}</div>
                <EditableContacto sg={sg} onSave={async (contacto) => {
                  const res = await fetch('/api/subgrupos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sg.id, contacto }) });
                  const data = await res.json();
                  setSubgrupos(prev => prev.map(s => s.id === sg.id ? data : s));
                }} />
              </div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)' }}>
                ${parseFloat(sg.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <select
                value={sg.estado}
                onChange={e => cambiarEstado(sg, e.target.value)}
                style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '6px', border: '1px solid var(--border)', background: ESTADO_COLORS[sg.estado]?.bg, color: ESTADO_COLORS[sg.estado]?.color, cursor: 'pointer' }}
              >
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => subirPDF(sg)} title="Subir PDF" style={{ padding: '3px 5px', borderRadius: '5px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}><FileUp size={11}/></button>
                <button onClick={() => enviarWhatsApp(sg)} title="WhatsApp" style={{ padding: '3px 5px', borderRadius: '5px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: '#16a34a' }}><MessageCircle size={11}/></button>
                <button onClick={() => eliminarSubgrupo(sg.id)} title="Eliminar" style={{ padding: '3px 5px', borderRadius: '5px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={11}/></button>
              </div>
            </div>
          ))}

          {!cargando && agregando && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="Nombre del subgrupo" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} style={{ flex: 2, minWidth: '120px', padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
              <input placeholder="Contacto" value={nuevoContacto} onChange={e => setNuevoContacto(e.target.value)} style={{ flex: 1, minWidth: '90px', padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
              <input placeholder="Monto" type="number" value={nuevoMonto} onChange={e => setNuevoMonto(e.target.value)} style={{ width: '80px', padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
              <button onClick={agregarSubgrupo} style={{ padding: '4px 8px', borderRadius: '6px', background: '#16a34a', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px' }}><Check size={12}/></button>
              <button onClick={() => setAgregando(false)} style={{ padding: '4px 8px', borderRadius: '6px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}><X size={12}/></button>
            </div>
          )}

          <button onClick={() => setAgregando(true)} style={{ width: '100%', padding: '8px', fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <Plus size={12}/> Agregar subgrupo
          </button>
        </div>
      )}
    </div>
  );
}
