'use client';
import { useState, useEffect } from 'react';
import { Upload, Send, Settings, Check, X, FileText, Trash2 } from 'lucide-react';

function parsearReporte(texto) {
  const lineas = texto.trim().split('\n');
  const grupos = {};
  lineas.forEach(linea => {
    const cols = linea.split('\t');
    if (cols.length < 6) return;
    const concepto = cols[2] || '';
    const montoRaw = cols[5] || '';
    const match = concepto.match(/Junior_BlueLine\s+(.+)$/i);
    if (!match) return;
    let nombre = match[1].trim().replace(/^000/, '').trim();
    const monto = parseFloat(montoRaw.replace(/[$,]/g, '')) || 0;
    if (!nombre || monto === 0) return;
    grupos[nombre] = (grupos[nombre] || 0) + monto;
  });
  return grupos;
}

function getSaludo() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'buenos días';
  if (h >= 12 && h < 19) return 'buenas tardes';
  return 'buenas noches';
}

export default function TabGrupos({ session, currentUser, empresaActual, showToast }) {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [telefonoJunior, setTelefonoJunior] = useState('');
  const [showConfigTel, setShowConfigTel] = useState(false);
  const [editandoNota, setEditandoNota] = useState(null);
  const [notaTemp, setNotaTemp] = useState('');

  const empresaId = session?.user?.empresa_id || empresaActual?.id;

  const cargar = async () => {
    setLoading(true);
    try {
      const url = empresaId ? '/api/grupos-blueline?empresa_id=' + empresaId : '/api/grupos-blueline';
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) setGrupos(data);
    } catch(e) {}
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    const tel = localStorage.getItem('junior_telefono') || '';
    setTelefonoJunior(tel);
  }, []);

  const marcarPagado = async (grupo) => {
    const esPagado = grupo.estado === 'PAGADO';
    const res = await fetch('/api/grupos-blueline', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: grupo.id,
        estado: esPagado ? 'PENDIENTE' : 'PAGADO',
        monto_pagado: esPagado ? 0 : grupo.monto_total,
        deuda_pendiente: esPagado ? grupo.monto_total : 0,
        fecha_pago: esPagado ? '' : new Date().toLocaleDateString('es-DO'),
        historial: [...(grupo.historial || []), {
          fecha: new Date().toISOString(),
          accion: esPagado ? 'Marcado PENDIENTE' : 'Marcado PAGADO',
          monto: grupo.monto_total
        }]
      })
    });
    if (res.ok) { await cargar(); if (showToast) showToast(esPagado ? 'Marcado como pendiente' : '✅ Marcado como pagado', 'success'); }
  };

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este grupo?')) return;
    await fetch('/api/grupos-blueline?id=' + id, { method: 'DELETE' });
    await cargar();
    if (showToast) showToast('Grupo eliminado', 'info');
  };

  const guardarNota = async (grupo) => {
    await fetch('/api/grupos-blueline', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: grupo.id, notas: notaTemp })
    });
    setEditandoNota(null);
    await cargar();
  };

  const procesar = () => {
    if (!texto.trim()) return;
    setProcesando(true);
    setTimeout(() => {
      const parsed = parsearReporte(texto);
      const items = Object.entries(parsed).map(([nombre, monto]) => {
        const existe = grupos.find(g => g.nombre.toLowerCase().trim() === nombre.toLowerCase().trim());
        return { nombre, monto, existe: !!existe, grupoId: existe?.id };
      }).sort((a, b) => b.monto - a.monto);
      setResultado(items);
      setProcesando(false);
    }, 300);
  };

  const aplicar = async () => {
    if (!resultado) return;
    setAplicando(true);
    let actualizados = 0, creados = 0;
    for (const item of resultado) {
      try {
        if (item.existe && item.grupoId) {
          await fetch('/api/grupos-blueline', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.grupoId,
              monto_total: item.monto,
              deuda_pendiente: item.monto,
              estado: 'PENDIENTE'
            })
          });
          actualizados++;
        } else {
          await fetch('/api/grupos-blueline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: item.nombre,
              monto_total: item.monto,
              monto_pagado: 0,
              deuda_pendiente: item.monto,
              estado: 'PENDIENTE',
              empresa_id: empresaId,
              numero: grupos.length + creados + 1
            })
          });
          creados++;
        }
      } catch(e) {}
    }
    setAplicando(false);
    setResultado(null);
    setTexto('');
    setShowImport(false);
    await cargar();
    if (showToast) showToast('✅ ' + actualizados + ' actualizados · ' + creados + ' nuevos', 'success');
  };

  const enviarWhatsApp = () => {
    const pendientes = grupos.filter(g => g.estado === 'PENDIENTE' && g.monto_total > 0);
    if (pendientes.length === 0) { if (showToast) showToast('No hay grupos pendientes', 'info'); return; }
    if (!telefonoJunior) { setShowConfigTel(true); return; }

    const saludo = getSaludo();
    let msg = 'Saludos, ' + saludo + ' Sr. Junior.\n\nLe informamos que estos son los balances pendientes:\n\n';
    let total = 0;
    pendientes.forEach(g => {
      msg += '• ' + g.nombre + ': RD$' + g.monto_total.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '\n';
      total += g.monto_total;
    });
    msg += '\nTotal pendiente: RD$' + total.toLocaleString('en-US', { maximumFractionDigits: 0 });

    const num = telefonoJunior.replace(/\D/g, '');
    const url = 'whatsapp://send?phone=' + num + '&text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
  };

  const totalPendiente = grupos.filter(g => g.estado === 'PENDIENTE').reduce((s, g) => s + (g.monto_total || 0), 0);
  const totalPagado = grupos.filter(g => g.estado === 'PAGADO').reduce((s, g) => s + (g.monto_total || 0), 0);
  const pendientesCount = grupos.filter(g => g.estado === 'PENDIENTE').length;
  const pagadosCount = grupos.filter(g => g.estado === 'PAGADO').length;

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:700, color:'#1a1915', letterSpacing:'-0.03em' }}>Grupos BlueLine</div>
          <div style={{ fontSize:'13px', color:'#9a998f', marginTop:'3px' }}>Cobranza mensual recurrente</div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => setShowConfigTel(true)} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'12px', fontWeight:600, border:'1px solid #e0dfd8', background:'#faf9f5', color:'#6b6a62', cursor:'pointer' }}>
            ⚙ Tel. Junior
          </button>
          <button onClick={enviarWhatsApp} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'13px', fontWeight:700, border:'none', background:'#25D366', color:'#fff', cursor:'pointer' }}>
            📲 Enviar a Junior
          </button>
          <button onClick={() => setShowImport(v => !v)} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'13px', fontWeight:700, border:'none', background:'#6366f1', color:'#fff', cursor:'pointer' }}>
            ⚡ Importar reporte
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'1.25rem' }}>
        {[
          { label:'Total grupos', val: grupos.length, color:'#1a1915', bg:'#faf9f5', border:'#e0dfd8' },
          { label:'Pendientes', val: pendientesCount, color:'#ea580c', bg:'#fff7ed', border:'#fed7aa' },
          { label:'Pagados', val: pagadosCount, color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
          { label:'Total pendiente', val: 'RD$' + totalPendiente.toLocaleString('en-US', { maximumFractionDigits:0 }), color:'#dc2626', bg:'#fff1f2', border:'#fecdd3' },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, border:'1.5px solid ' + s.border, borderRadius:'12px', padding:'12px 16px' }}>
            <div style={{ fontSize:'10px', fontWeight:800, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'6px' }}>{s.label}</div>
            <div style={{ fontSize:'22px', fontWeight:900, color:s.color, fontFamily:'monospace' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Importador */}
      {showImport && (
        <div style={{ background:'#fff', border:'1px solid #e0dfd8', borderRadius:'12px', padding:'16px', marginBottom:'12px' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Importar reporte BlueLine</div>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} style={{ width:'100%', height:'120px', border:'1px solid #e0dfd8', borderRadius:'8px', padding:'10px', fontSize:'12px', fontFamily:'monospace', color:'#3d3c35', resize:'vertical', background:'#faf9f5', outline:'none' }} placeholder={'Pega aquí el reporte completo de BlueLine...'}/>
          <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
            <button onClick={procesar} disabled={!texto.trim() || procesando} style={{ padding:'8px 20px', borderRadius:'8px', fontSize:'13px', fontWeight:700, border:'none', background: texto.trim() ? '#6366f1' : '#e0dfd8', color: texto.trim() ? '#fff' : '#9a998f', cursor: texto.trim() ? 'pointer' : 'not-allowed' }}>
              {procesando ? 'Procesando...' : '⚡ Procesar'}
            </button>
            <button onClick={() => { setShowImport(false); setResultado(null); setTexto(''); }} style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'13px', fontWeight:600, border:'1px solid #e0dfd8', background:'#faf9f5', color:'#6b6a62', cursor:'pointer' }}>
              Cancelar
            </button>
          </div>

          {resultado && (
            <div style={{ marginTop:'12px', border:'1px solid #e0dfd8', borderRadius:'10px', overflow:'hidden' }}>
              <div style={{ padding:'10px 14px', background:'#f0efe9', borderBottom:'1px solid #e0dfd8', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:'12px', fontWeight:600, color:'#1a1915' }}>{resultado.length} grupos encontrados</span>
                <div style={{ display:'flex', gap:'8px' }}>
                  <span style={{ fontSize:'11px', color:'#16a34a', fontWeight:600 }}>{resultado.filter(i=>i.existe).length} existentes</span>
                  <span style={{ fontSize:'11px', color:'#ea580c', fontWeight:600 }}>{resultado.filter(i=>!i.existe).length} nuevos</span>
                </div>
              </div>
              <div style={{ maxHeight:'250px', overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <tbody>
                    {resultado.map((item, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f5f4ef', background: i%2===0?'#fff':'#fdfcf8' }}>
                        <td style={{ padding:'8px 14px', fontWeight:500, color:'#1a1915' }}>{item.nombre}</td>
                        <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:600 }}>RD$ {item.monto.toLocaleString('en-US', { maximumFractionDigits:0 })}</td>
                        <td style={{ padding:'8px 14px', textAlign:'center' }}>
                          {item.existe
                            ? <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background:'#dcfce7', color:'#14532d' }}>✓ Existe</span>
                            : <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background:'#fff7ed', color:'#c2410c' }}>⚡ Nuevo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding:'10px 14px', borderTop:'1px solid #e0dfd8', background:'#f0efe9', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
                <button onClick={() => { setResultado(null); setTexto(''); }} style={{ padding:'7px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:600, border:'1px solid #e0dfd8', background:'#faf9f5', color:'#6b6a62', cursor:'pointer' }}>Limpiar</button>
                <button onClick={aplicar} disabled={aplicando} style={{ padding:'7px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:700, border:'none', background:'#16a34a', color:'#fff', cursor:'pointer' }}>
                  {aplicando ? 'Aplicando...' : 'Aplicar todo'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabla grupos */}
      <div style={{ background:'#fff', border:'1px solid #e0dfd8', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr style={{ background:'#f0efe9', borderBottom:'1px solid #e0dfd8' }}>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>#</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Grupo / Cliente</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Monto Total</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Monto Pagado</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Deuda Pendiente</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Estado</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Fecha Pago</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Notas</th>
              <th style={{ padding:'10px 14px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding:'2rem', textAlign:'center', color:'#9a998f' }}>Cargando...</td></tr>
            ) : grupos.length === 0 ? (
              <tr><td colSpan={9} style={{ padding:'2rem', textAlign:'center', color:'#9a998f' }}>No hay grupos. Importa el primer reporte.</td></tr>
            ) : grupos.map((g, i) => (
              <tr key={g.id} style={{ borderBottom:'1px solid #f5f4ef', background: g.estado === 'PAGADO' ? '#f0fdf4' : i%2===0?'#fff':'#fdfcf8' }}>
                <td style={{ padding:'10px 14px', color:'#9a998f', fontFamily:'monospace' }}>{g.numero || i+1}</td>
                <td style={{ padding:'10px 14px', fontWeight:600, color: g.estado === 'PAGADO' ? '#16a34a' : '#1a1915' }}>{g.nombre}</td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'#1a1915' }}>RD$ {(g.monto_total||0).toLocaleString('en-US', { maximumFractionDigits:0 })}</td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', color:'#16a34a', fontWeight:600 }}>RD$ {(g.monto_pagado||0).toLocaleString('en-US', { maximumFractionDigits:0 })}</td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', color: g.deuda_pendiente > 0 ? '#dc2626' : '#9a998f', fontWeight:600 }}>RD$ {(g.deuda_pendiente||0).toLocaleString('en-US', { maximumFractionDigits:0 })}</td>
                <td style={{ padding:'10px 14px', textAlign:'center' }}>
                  <button onClick={() => marcarPagado(g)} style={{ padding:'4px 12px', borderRadius:'20px', fontSize:'11px', fontWeight:700, border:'none', cursor:'pointer', background: g.estado === 'PAGADO' ? '#dcfce7' : '#fff7ed', color: g.estado === 'PAGADO' ? '#14532d' : '#c2410c' }}>
                    {g.estado === 'PAGADO' ? '✓ Pagado' : '● Pendiente'}
                  </button>
                </td>
                <td style={{ padding:'10px 14px', textAlign:'center', fontSize:'12px', color:'#9a998f' }}>{g.fecha_pago || '—'}</td>
                <td style={{ padding:'10px 14px' }}>
                  {editandoNota === g.id ? (
                    <div style={{ display:'flex', gap:'4px' }}>
                      <input value={notaTemp} onChange={e => setNotaTemp(e.target.value)} style={{ fontSize:'12px', padding:'4px 8px', border:'1px solid #6366f1', borderRadius:'6px', outline:'none', width:'140px' }} autoFocus onKeyDown={e => { if(e.key==='Enter') guardarNota(g); if(e.key==='Escape') setEditandoNota(null); }}/>
                      <button onClick={() => guardarNota(g)} style={{ padding:'4px 8px', borderRadius:'6px', border:'none', background:'#6366f1', color:'#fff', fontSize:'11px', cursor:'pointer' }}>✓</button>
                    </div>
                  ) : (
                    <span onClick={() => { setEditandoNota(g.id); setNotaTemp(g.notas||''); }} style={{ fontSize:'12px', color: g.notas ? '#3d3c35' : '#b5b4ab', cursor:'pointer' }} title="Clic para editar">
                      {g.notas || 'Agregar nota...'}
                    </span>
                  )}
                </td>
                <td style={{ padding:'10px 14px', textAlign:'center' }}>
                  <button onClick={() => eliminar(g.id)} style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid #fca5a5', background:'#fee2e2', color:'#dc2626', fontSize:'11px', cursor:'pointer' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {grupos.length > 0 && (
          <div style={{ padding:'10px 16px', borderTop:'1px solid #e0dfd8', background:'#f0efe9', display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9a998f' }}>
            <span>Total cobrado: <strong style={{ color:'#16a34a' }}>RD$ {totalPagado.toLocaleString('en-US', { maximumFractionDigits:0 })}</strong></span>
            <span>Total pendiente: <strong style={{ color:'#dc2626' }}>RD$ {totalPendiente.toLocaleString('en-US', { maximumFractionDigits:0 })}</strong></span>
          </div>
        )}
      </div>

      {/* Modal teléfono Junior */}
      {showConfigTel && (
        <div className="modal show">
          <div className="modal-content" style={{ maxWidth:'400px' }}>
            <div className="modal-header">
              <h2>Teléfono Sr. Junior</h2>
              <button className="close-btn" onClick={() => setShowConfigTel(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Número de WhatsApp</label>
              <input type="tel" value={telefonoJunior} onChange={e => setTelefonoJunior(e.target.value)} placeholder="Ej: 18091234567" />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfigTel(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { localStorage.setItem('junior_telefono', telefonoJunior); setShowConfigTel(false); if(showToast) showToast('Teléfono guardado', 'success'); }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
