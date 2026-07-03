'use client';
import { useState, useEffect } from 'react';
import { Plus, X, Clock } from 'lucide-react';

const STORAGE_KEY = 'agenda_tareas_v1';

export default function AgendaTareas({ currentUser }) {
  const [tareas, setTareas] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [cliente, setCliente] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('09:00');
  const [nota, setNota] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const key = STORAGE_KEY + '_' + (currentUser || 'default');
    try { const s = localStorage.getItem(key); if (s) setTareas(JSON.parse(s)); } catch {}
  }, [currentUser]);

  useEffect(() => {
    const key = STORAGE_KEY + '_' + (currentUser || 'default');
    try { localStorage.setItem(key, JSON.stringify(tareas)); } catch {}
  }, [tareas, currentUser]);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const guardar = () => {
    if (!titulo.trim() || !fecha || !hora) return;
    const diff = new Date(fecha + 'T' + hora) - new Date();
    const color = diff < 86400000 ? 'urgente' : diff < 259200000 ? 'pronto' : 'ok';
    const nueva = { id: Date.now(), titulo: titulo.trim(), cliente: cliente.trim(), fecha, hora, nota: nota.trim(), color };
    setTareas(prev => [...prev, nueva].sort((a, b) => new Date(a.fecha + 'T' + a.hora) - new Date(b.fecha + 'T' + b.hora)));
    setTitulo(''); setCliente(''); setFecha(''); setHora('09:00'); setNota('');
    setShowForm(false);
  };

  const eliminar = (id) => setTareas(prev => prev.filter(t => t.id !== id));

  const getCountdown = (fecha, hora) => {
    const diff = new Date(fecha + 'T' + hora) - new Date();
    if (diff < 0) return { texto: 'Vencida', sub: '', color: '#A32D2D' };
    const dias = Math.floor(diff / 86400000);
    const horas = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const color = dias === 0 ? '#E24B4A' : dias <= 2 ? '#BA7517' : '#639922';
    if (dias > 0) return { texto: dias + 'd ' + horas + 'h', sub: 'restantes', color };
    if (horas > 0) return { texto: horas + 'h ' + mins + 'm', sub: 'restantes', color };
    return { texto: mins + 'm', sub: 'restantes', color };
  };

  const hoy = new Date().toISOString().split('T')[0];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showForm ? '1rem' : tareas.length > 0 ? '1rem' : '0' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={16} /> Tareas programadas
        </div>
        <button onClick={() => { setShowForm(!showForm); setFecha(hoy); }} style={{ background: '#378ADD', color: 'white', border: 'none', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={13} /> Nueva tarea
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Titulo</div>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder='Ej: Llamar a Juan De La Cruz' style={{ width: '100%', padding: '7px 10px', border: '0.5px solid var(--border-strong)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Cliente (opcional)</div>
              <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder='Nombre del cliente' style={{ width: '100%', padding: '7px 10px', border: '0.5px solid var(--border-strong)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Fecha</div>
              <input type='date' value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: '0.5px solid var(--border-strong)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Hora</div>
              <input type='time' value={hora} onChange={e => setHora(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: '0.5px solid var(--border-strong)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Nota</div>
              <input value={nota} onChange={e => setNota(e.target.value)} placeholder='Descripcion opcional...' style={{ width: '100%', padding: '7px 10px', border: '0.5px solid var(--border-strong)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: '0.5px solid var(--border-strong)', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={guardar} style={{ background: '#378ADD', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Guardar tarea</button>
          </div>
        </div>
      )}

      {tareas.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '1rem 0' }}>No hay tareas programadas</div>
      )}

      {tareas.map(t => {
        const cd = getCountdown(t.fecha, t.hora);
        const fechaFmt = new Date(t.fecha + 'T' + t.hora).toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const borderColor = t.color === 'urgente' ? '#E24B4A' : t.color === 'pronto' ? '#BA7517' : '#639922';
        const badgeBg = t.color === 'urgente' ? '#FCEBEB' : t.color === 'pronto' ? '#FAEEDA' : '#EAF3DE';
        const badgeColor = t.color === 'urgente' ? '#A32D2D' : t.color === 'pronto' ? '#854F0B' : '#3B6D11';
        const badgeText = t.color === 'urgente' ? 'Urgente' : t.color === 'pronto' ? 'Pronto' : 'Programado';
        return (
          <div key={t.id} style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderLeft: '3px solid ' + borderColor, borderRadius: '10px', padding: '10px 14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {t.titulo}
                <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: badgeBg, color: badgeColor, fontWeight: 500 }}>{badgeText}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {fechaFmt}{t.cliente ? ' · ' + t.cliente : ''}{t.nota ? ' · ' + t.nota : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: 500, color: cd.color }}>{cd.texto}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{cd.sub}</div>
            </div>
            <button onClick={() => eliminar(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: '4px', flexShrink: 0 }} aria-label='Eliminar'>x</button>
          </div>
        );
      })}
    </div>
  );
}
