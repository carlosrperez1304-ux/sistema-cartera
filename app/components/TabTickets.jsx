'use client';
import { useState, useEffect } from 'react';

const PASOS = ['abierto','en_progreso','revision','aprobado','cerrado'];
const PASO_LABELS = ['Abierto','En Progreso','Revisión','Aprobado','Cerrado'];
const COLORES = { abierto:'#6366f1', en_progreso:'#f97316', revision:'#0891b2', aprobado:'#16a34a', cerrado:'#16a34a' };
const PRIORIDAD_LABEL = { urgente:'🔴 Urgente', alta:'🟠 Alta', media:'🟡 Media', normal:'⚪ Normal' };
const PRIORIDAD_COLOR = { urgente:'#dc2626', alta:'#ea580c', media:'#854d0e', normal:'#475569' };

function getAvatar(nombre) {
  if (!nombre) return { letra:'?', color:'#9a998f' };
  const colores = ['#6366f1','#0891b2','#16a34a','#dc2626','#f59e0b','#8b5cf6','#ec4899'];
  const letra = nombre.trim()[0].toUpperCase();
  const color = colores[nombre.charCodeAt(0) % colores.length];
  return { letra, color };
}

export default function TabTickets({ currentUser, session, empresaActual, clientes, showToast }) {
  const [tickets, setTickets] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  const [form, setForm] = useState({ titulo:'', descripcion:'', tipo:'tarea', prioridad:'normal', asignado_a:'', cliente_nombre:'' });

  const empresaId = session?.user?.empresa_id || empresaActual?.id;
  const usuarioActual = currentUser || session?.user?.username || 'Sistema';

  const cargar = async () => {
    try {
      const url = empresaId ? '/api/tickets?empresa_id=' + empresaId : '/api/tickets';
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) setTickets(data);
    } catch(e) {}
  };

  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    if (!form.titulo) return;
    const payload = { ...form, creado_por: usuarioActual, empresa_id: empresaId, estado: 'abierto', historial: [{ fecha: new Date().toISOString(), accion: 'Ticket creado', usuario: usuarioActual }] };
    const res = await fetch('/api/tickets', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (res.ok) {
      await cargar();
      setShowModal(false);
      setForm({ titulo:'', descripcion:'', tipo:'tarea', prioridad:'normal', asignado_a:'', cliente_nombre:'' });
      if (showToast) showToast('Ticket creado', 'success');
    }
  };

  const avanzar = async (ticket) => {
    const idx = PASOS.indexOf(ticket.estado);
    if (idx >= PASOS.length - 1) return;
    const nuevoEstado = PASOS[idx + 1];
    const historial = [...(ticket.historial||[]), { fecha: new Date().toISOString(), accion: '→ ' + nuevoEstado, usuario: usuarioActual }];
    await fetch('/api/tickets', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: ticket.id, estado: nuevoEstado, historial }) });
    await cargar();
  };

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este ticket?')) return;
    await fetch('/api/tickets?id=' + id, { method:'DELETE' });
    await cargar();
    if (showToast) showToast('Ticket eliminado', 'info');
  };

  const ticketsFiltrados = tickets.filter(t => {
    if (filtro === 'tarea') return t.tipo === 'tarea';
    if (filtro === 'cliente') return t.tipo === 'cliente';
    if (filtro === 'urgentes') return t.prioridad === 'urgente';
    if (filtro === 'cerrados') return t.estado === 'cerrado';
    return true;
  });

  const usuariosDisponibles = [...new Set([(clientes||[]).map(c=>c.creadoPor).filter(Boolean), usuarioActual].flat().filter(Boolean))];

  return (
    <div>
      <div style={{ marginBottom:'1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:'18px', fontWeight:700, color:'#1a1915' }}>Tickets de Trabajo</div>
          <div style={{ fontSize:'12px', color:'#9a998f', marginTop:'2px' }}>{tickets.filter(t=>t.estado!=='cerrado').length} abiertos · {tickets.filter(t=>t.estado==='cerrado').length} cerrados</div>
        </div>
        <button onClick={() => setShowModal(true)} style={{ padding:'8px 16px', borderRadius:'9px', fontSize:'13px', fontWeight:700, border:'none', background:'#6366f1', color:'#fff', cursor:'pointer' }}>+ Nuevo Ticket</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'1.25rem' }}>
        {[
          { label:'Pendientes', val: tickets.filter(t=>t.estado==='abierto').length, color:'#4f46e5', bg:'#eff6ff', border:'#bfdbfe', bar:'#6366f1' },
          { label:'En Progreso', val: tickets.filter(t=>t.estado==='en_progreso').length, color:'#ea580c', bg:'#fff7ed', border:'#fed7aa', bar:'#f97316' },
          { label:'Urgentes', val: tickets.filter(t=>t.prioridad==='urgente').length, color:'#dc2626', bg:'#fff1f2', border:'#fecdd3', bar:'#f43f5e' },
          { label:'Cerrados', val: tickets.filter(t=>t.estado==='cerrado').length, color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0', bar:'#22c55e' },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, border:'1.5px solid ' + s.border, borderRadius:'12px', padding:'12px 16px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:s.bar, borderRadius:'12px 12px 0 0' }}></div>
            <div style={{ fontSize:'10px', fontWeight:800, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'6px' }}>{s.label}</div>
            <div style={{ fontSize:'26px', fontWeight:900, color:s.color, fontFamily:'monospace' }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'6px', marginBottom:'1rem' }}>
        {['todos','tarea','cliente','urgentes','cerrados'].map(f => (
          <span key={f} onClick={() => setFiltro(f)} style={{ padding:'6px 14px', borderRadius:'20px', fontSize:'11px', fontWeight:700, cursor:'pointer', background: filtro===f ? '#1a1915' : '#faf9f5', color: filtro===f ? '#fff' : '#6b6a62', border: filtro===f ? 'none' : '1px solid #e0dfd8' }}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </span>
        ))}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
        {ticketsFiltrados.map(ticket => {
          const idx = PASOS.indexOf(ticket.estado);
          const colorH = COLORES[ticket.estado] || '#6366f1';
          const esMio = ticket.asignado_a === usuarioActual || ticket.creado_por === usuarioActual;
          const av = getAvatar(ticket.creado_por);
          return (
            <div key={ticket.id} style={{ background:'#fff', borderRadius:'14px', overflow:'hidden', border:'1px solid #e0dfd8', opacity: ticket.estado==='cerrado' ? 0.75 : 1 }}>
              <div style={{ background:colorH, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ background:'rgba(255,255,255,0.25)', color:'#fff', fontSize:'11px', fontWeight:800, padding:'3px 10px', borderRadius:'5px' }}>TICKET #{ticket.numero || ticket.id?.slice(0,6).toUpperCase()}</span>
                  <span style={{ color:'rgba(255,255,255,0.85)', fontSize:'12px' }}>{new Date(ticket.created_at).toLocaleDateString('es-DO', { day:'numeric', month:'short' })}</span>
                </div>
                <span style={{ background:'rgba(255,255,255,0.25)', color:'#fff', fontSize:'11px', fontWeight:700, padding:'4px 12px', borderRadius:'20px', border:'1px solid rgba(255,255,255,0.4)' }}>{PASO_LABELS[idx]}</span>
              </div>
              <div style={{ padding:'16px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', marginBottom:'6px' }}>
                  {PASOS.map((p,i) => (
                    <span key={p} style={{ display:'contents' }}>
                      <div style={{ width:'14px', height:'14px', borderRadius:'50%', background: i<=idx ? colorH : '#fff', border: i<=idx ? 'none' : '2px solid #e0dfd8', flexShrink:0 }}></div>
                      {i < PASOS.length-1 && <div style={{ height:'3px', flex:1, background: i<idx ? colorH : '#e0dfd8' }}></div>}
                    </span>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'14px' }}>
                  {PASO_LABELS.map((l,i) => <span key={l} style={{ fontSize:'10px', fontWeight: i<=idx ? 700 : 400, color: i<=idx ? colorH : '#9a998f' }}>{l}</span>)}
                </div>
                <div style={{ fontSize:'15px', fontWeight:800, color:'#1a1915', marginBottom:'12px', textTransform:'uppercase', textDecoration: ticket.estado==='cerrado' ? 'line-through' : 'none', opacity: ticket.estado==='cerrado' ? 0.6 : 1 }}>{ticket.titulo}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
                  <div style={{ background:'#f5f4ef', borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', marginBottom:'3px' }}>Tipo</div>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'#1a1915' }}>{ticket.tipo === 'tarea' ? '⚙️ Tarea' : '👤 Cliente'}</div>
                  </div>
                  <div style={{ background:'#f5f4ef', borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', marginBottom:'3px' }}>Prioridad</div>
                    <div style={{ fontSize:'13px', fontWeight:600, color: PRIORIDAD_COLOR[ticket.prioridad] }}>{PRIORIDAD_LABEL[ticket.prioridad]}</div>
                  </div>
                  {ticket.asignado_a && <div style={{ background:'#f5f4ef', borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', marginBottom:'3px' }}>Asignado a</div>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'#1a1915' }}>{ticket.asignado_a}</div>
                  </div>}
                  {ticket.cliente_nombre && <div style={{ background:'#f5f4ef', borderRadius:'8px', padding:'8px 12px' }}>
                    <div style={{ fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', marginBottom:'3px' }}>Cliente</div>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'#1a1915' }}>{ticket.cliente_nombre}</div>
                  </div>}
                </div>
                {ticket.descripcion && <div style={{ background:'#f5f4ef', borderRadius:'8px', padding:'10px 14px', marginBottom:'12px', fontSize:'13px', color:'#3d3c35', lineHeight:1.5 }}>{ticket.descripcion}</div>}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:av.color, color:'#fff', fontSize:'11px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{av.letra}</div>
                    <span style={{ fontSize:'13px', fontWeight:600, color:'#1a1915' }}>{ticket.creado_por}</span>
                  </div>
                  <div style={{ display:'flex', gap:'6px' }}>
                    {ticket.estado !== 'cerrado' && esMio && (
                      <button onClick={() => avanzar(ticket)} style={{ padding:'7px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:700, border:'none', background:colorH, color:'#fff', cursor:'pointer' }}>→ {PASO_LABELS[idx+1] || 'Cerrar'}</button>
                    )}
                    <button onClick={() => eliminar(ticket.id)} style={{ padding:'7px 10px', borderRadius:'8px', fontSize:'12px', border:'1px solid #fca5a5', background:'#fee2e2', color:'#dc2626', cursor:'pointer' }}>✕</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {ticketsFiltrados.length === 0 && <div style={{ textAlign:'center', padding:'4rem 2rem', color:'#9a998f' }}><div style={{ fontSize:'1rem', fontWeight:700, color:'#3d3c35', marginBottom:'0.4rem' }}>No hay tickets</div><div>Crea el primero con el botón de arriba</div></div>}
      </div>

      {showModal && (
        <div className="modal show">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Nuevo Ticket</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="form-group"><label>Título</label><input type="text" value={form.titulo} onChange={e => setForm(f=>({...f, titulo:e.target.value}))} placeholder="Describe el problema o tarea..." /></div>
            <div className="form-group"><label>Descripción</label><textarea value={form.descripcion} onChange={e => setForm(f=>({...f, descripcion:e.target.value}))} placeholder="Detalles adicionales..." /></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div className="form-group"><label>Tipo</label><select value={form.tipo} onChange={e => setForm(f=>({...f, tipo:e.target.value}))}><option value="tarea">⚙️ Tarea Interna</option><option value="cliente">👤 Cliente</option></select></div>
              <div className="form-group"><label>Prioridad</label><select value={form.prioridad} onChange={e => setForm(f=>({...f, prioridad:e.target.value}))}><option value="urgente">🔴 Urgente</option><option value="alta">🟠 Alta</option><option value="media">🟡 Media</option><option value="normal">⚪ Normal</option></select></div>
            </div>
            <div className="form-group"><label>Asignar a</label><select value={form.asignado_a} onChange={e => setForm(f=>({...f, asignado_a:e.target.value}))}><option value="">Sin asignar</option>{usuariosDisponibles.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
            {form.tipo === 'cliente' && <div className="form-group"><label>Cliente relacionado</label><input type="text" value={form.cliente_nombre} onChange={e => setForm(f=>({...f, cliente_nombre:e.target.value}))} placeholder="Nombre del cliente..." /></div>}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={crear} disabled={!form.titulo}>Crear Ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
