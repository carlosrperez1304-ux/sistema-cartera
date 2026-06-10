'use client';
import { useState, useEffect } from 'react';
import { Upload, Send, Settings, X, Trash2, ChevronDown, ChevronUp, DollarSign, Clock, FileText, AlertCircle } from 'lucide-react';

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

function getMesActual() {
  return new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
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
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
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
    setTelefonoJunior(localStorage.getItem('junior_telefono') || '');
  }, []);

  const marcarPagado = async (grupo) => {
    const esPagado = grupo.estado === 'PAGADO';
    // Deuda acumulada = total - mes actual
    const deudaAnterior = (grupo.deuda_pendiente || 0) - (grupo.monto_total || 0);
    const historial = [...(grupo.historial || []), {
      fecha: new Date().toISOString(),
      mes: getMesActual(),
      accion: esPagado ? 'Marcado PENDIENTE' : 'Marcado PAGADO',
      monto: grupo.monto_total
    }];
    const res = await fetch('/api/grupos-blueline', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: grupo.id,
        estado: esPagado ? 'PENDIENTE' : 'PAGADO',
        monto_pagado: esPagado ? 0 : grupo.monto_total,
        deuda_pendiente: esPagado ? grupo.monto_total : Math.max(0, deudaAnterior),
        fecha_pago: esPagado ? '' : new Date().toLocaleDateString('es-DO'),
        historial
      })
    });
    if (res.ok) {
      await cargar();
      if (grupoSeleccionado?.id === grupo.id) {
        const updated = await fetch('/api/grupos-blueline?empresa_id=' + empresaId);
        const data = await updated.json();
        const g = data.find(x => x.id === grupo.id);
        if (g) setGrupoSeleccionado(g);
      }
      if (showToast) showToast(esPagado ? 'Marcado como pendiente' : '✅ Marcado como pagado', 'success');
    }
  };

  const cierreDeMes = async () => {
    const mes = getMesActual();
    const yaHizoCierre = grupos.some(g => (g.historial||[]).some(h => h.mes === mes && h.accion === 'Cierre de mes'));
    if (yaHizoCierre) { if (showToast) showToast('Ya se realizó el cierre de ' + mes, 'error'); return; }
    if (!confirm('¿Cerrar el mes? Los grupos pendientes acumularán su deuda al próximo mes.')) return;
    for (const g of grupos) {
      const nuevaDeuda = g.estado === 'PENDIENTE' ? (g.deuda_pendiente || 0) : 0;
      const historial = [...(g.historial || []), {
        fecha: new Date().toISOString(),
        mes,
        accion: 'Cierre de mes',
        monto_total: g.monto_total,
        monto_pagado: g.monto_pagado,
        deuda: nuevaDeuda,
        estado: g.estado
      }];
      await fetch('/api/grupos-blueline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: g.id,
          monto_total: 0,
          monto_pagado: 0,
          deuda_pendiente: nuevaDeuda,
          estado: 'PENDIENTE',
          fecha_pago: '',
          historial
        })
      });
    }
    await cargar();
    if (showToast) showToast('✅ Mes cerrado. Deudas acumuladas.', 'success');
  };

  const toggleSuspendido = async (grupo) => {
    await fetch('/api/grupos-blueline', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: grupo.id, suspendido: !grupo.suspendido })
    });
    await cargar();
    if (showToast) showToast(grupo.suspendido ? 'Grupo reactivado' : 'Grupo suspendido', 'info');
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
          // Buscar la deuda acumulada del grupo existente
          const grupoExistente = grupos.find(g => g.id === item.grupoId);
          const deudaAcumulada = grupoExistente?.deuda_pendiente || 0;
          const nuevaDeuda = deudaAcumulada + item.monto;
          const r = await fetch('/api/grupos-blueline', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.grupoId, monto_total: item.monto, deuda_pendiente: nuevaDeuda, estado: 'PENDIENTE' })
          });
          if (r.ok) actualizados++;
          else { const e = await r.json(); console.error('PUT error:', e); }
        } else {
          const r = await fetch('/api/grupos-blueline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: item.nombre, monto_total: item.monto, monto_pagado: 0, deuda_pendiente: item.monto, estado: 'PENDIENTE', empresa_id: empresaId, numero: grupos.length + creados + 1, historial: [] })
          });
          if (r.ok) creados++;
          else { const e = await r.json(); console.error('POST error:', e, 'item:', item); }
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
    window.open('whatsapp://send?phone=' + num + '&text=' + encodeURIComponent(msg), '_blank');
  };

  const totalPendiente = grupos.filter(g => g.estado === 'PENDIENTE').reduce((s, g) => s + (g.monto_total || 0), 0);
  const totalPagado = grupos.filter(g => g.estado === 'PAGADO').reduce((s, g) => s + (g.monto_total || 0), 0);
  const totalDeuda = grupos.reduce((s, g) => s + (g.deuda_pendiente || 0), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:700, color:'#1a1915', letterSpacing:'-0.03em' }}>Grupos BlueLine</div>
          <div style={{ fontSize:'13px', color:'#9a998f', marginTop:'3px' }}>{getMesActual()} · Cobranza mensual recurrente</div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => setShowConfigTel(true)} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'12px', fontWeight:600, border:'1px solid #e0dfd8', background:'#faf9f5', color:'#6b6a62', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
            <Settings size={13}/> Tel. Junior
          </button>
          <button onClick={enviarWhatsApp} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'13px', fontWeight:700, border:'none', background:'#25D366', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
            <Send size={13}/> Enviar a Junior
          </button>
          <button onClick={cierreDeMes} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'13px', fontWeight:700, border:'1px solid #fca5a5', background:'#fee2e2', color:'#dc2626', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
            <FileText size={13}/> Cierre de Mes
          </button>
          <button onClick={() => setShowImport(v => !v)} style={{ padding:'8px 14px', borderRadius:'9px', fontSize:'13px', fontWeight:700, border:'none', background:'#6366f1', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }}>
            <Upload size={13}/> Importar reporte
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'1.25rem' }}>
        {[
          { label:'Total grupos', val: grupos.length, color:'#1a1915', bg:'#faf9f5', border:'#e0dfd8' },
          { label:'Pendientes', val: grupos.filter(g=>g.estado==='PENDIENTE').length, color:'#ea580c', bg:'#fff7ed', border:'#fed7aa' },
          { label:'Pagados', val: grupos.filter(g=>g.estado==='PAGADO').length, color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
          { label:'Total pendiente', val: 'RD$' + totalPendiente.toLocaleString('en-US',{maximumFractionDigits:0}), color:'#dc2626', bg:'#fff1f2', border:'#fecdd3' },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, border:'1.5px solid '+s.border, borderRadius:'12px', padding:'12px 16px' }}>
            <div style={{ fontSize:'10px', fontWeight:800, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'6px' }}>{s.label}</div>
            <div style={{ fontSize:'22px', fontWeight:900, color:s.color, fontFamily:'monospace' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Importador */}
      {showImport && (
        <div style={{ background:'#fff', border:'1px solid #e0dfd8', borderRadius:'12px', padding:'16px', marginBottom:'12px' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Importar reporte BlueLine</div>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} style={{ width:'100%', height:'120px', border:'1px solid #e0dfd8', borderRadius:'8px', padding:'10px', fontSize:'12px', fontFamily:'monospace', color:'#3d3c35', resize:'vertical', background:'#faf9f5', outline:'none' }} placeholder="Pega aquí el reporte completo de BlueLine..."/>
          <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
            <button onClick={procesar} disabled={!texto.trim()||procesando} style={{ padding:'8px 20px', borderRadius:'8px', fontSize:'13px', fontWeight:700, border:'none', background:texto.trim()?'#6366f1':'#e0dfd8', color:texto.trim()?'#fff':'#9a998f', cursor:texto.trim()?'pointer':'not-allowed' }}>
              {procesando ? 'Procesando...' : 'Procesar reporte'}
            </button>
            <button onClick={() => { setShowImport(false); setResultado(null); setTexto(''); }} style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'13px', fontWeight:600, border:'1px solid #e0dfd8', background:'#faf9f5', color:'#6b6a62', cursor:'pointer' }}>Cancelar</button>
          </div>
          {resultado && (
            <div style={{ marginTop:'12px', border:'1px solid #e0dfd8', borderRadius:'10px', overflow:'hidden' }}>
              <div style={{ padding:'10px 14px', background:'#f0efe9', borderBottom:'1px solid #e0dfd8', display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:'12px', fontWeight:600 }}>{resultado.length} grupos</span>
                <div style={{ display:'flex', gap:'8px' }}>
                  <span style={{ fontSize:'11px', color:'#16a34a', fontWeight:600 }}>{resultado.filter(i=>i.existe).length} existentes</span>
                  <span style={{ fontSize:'11px', color:'#ea580c', fontWeight:600 }}>{resultado.filter(i=>!i.existe).length} nuevos</span>
                </div>
              </div>
              <div style={{ maxHeight:'220px', overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <tbody>
                    {resultado.map((item,i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f5f4ef', background:i%2===0?'#fff':'#fdfcf8' }}>
                        <td style={{ padding:'8px 14px', fontWeight:500, color:'#1a1915' }}>{item.nombre}</td>
                        <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:600 }}>RD$ {item.monto.toLocaleString('en-US',{maximumFractionDigits:0})}</td>
                        <td style={{ padding:'8px 14px', textAlign:'center' }}>
                          {item.existe
                            ? <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background:'#dcfce7', color:'#14532d' }}>Existe</span>
                            : <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background:'#fff7ed', color:'#c2410c' }}>Nuevo</span>}
                        </td>
                      </tr>
                    );
              return (<>
                {activos.map((g, i) => renderFila(g, i))}
                {soloDeuda.length > 0 && (
                  <tr><td colSpan={9} style={{ padding:'8px 14px', background:'#fff7ed', borderTop:'2px solid #fed7aa', borderBottom:'1px solid #fed7aa' }}>
                    <span style={{ fontSize:'10px', fontWeight:700, color:'#ea580c', textTransform:'uppercase', letterSpacing:'0.08em' }}>⚠ Deuda de meses anteriores — {soloDeuda.length} grupos</span>
                  </td></tr>
                )}
                {soloDeuda.map((g, i) => renderFila(g, activos.length + i))}
              </>);
            })()}
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

      {/* Tabla */}
      <div style={{ background:'#fff', border:'1px solid #e0dfd8', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr style={{ background:'#f0efe9', borderBottom:'1px solid #e0dfd8' }}>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>#</th>
              <th style={{ padding:'10px 14px', textAlign:'left', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Grupo / Cliente</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Monto Total</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Monto Pagado</th>
              <th style={{ padding:'10px 14px', textAlign:'right', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Deuda</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Estado</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Fecha Pago</th>
              <th style={{ padding:'10px 14px', textAlign:'center', fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em' }}>Susp.</th>
              <th style={{ padding:'10px 14px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding:'2rem', textAlign:'center', color:'#9a998f' }}>Cargando...</td></tr>
            ) : grupos.length === 0 ? (
              <tr><td colSpan={9} style={{ padding:'2rem', textAlign:'center', color:'#9a998f' }}>No hay grupos. Importa el primer reporte.</td></tr>
            ) : (() => {
              const activos = grupos.filter(g => (g.monto_total||0) > 0);
              const soloDeuda = grupos.filter(g => (g.monto_total||0) === 0 && (g.deuda_pendiente||0) > 0);
              const renderFila = (g, i) => (
              <tr key={g.id} onClick={() => setGrupoSeleccionado(g)} style={{ borderBottom:'1px solid #f5f4ef', background:g.estado==='PAGADO'?'#f0fdf4':i%2===0?'#fff':'#fdfcf8', cursor:'pointer', transition:'background 0.1s' }}
                onMouseOver={e => e.currentTarget.style.background = g.estado==='PAGADO'?'#dcfce7':'#faf9f5'}
                onMouseOut={e => e.currentTarget.style.background = g.estado==='PAGADO'?'#f0fdf4':i%2===0?'#fff':'#fdfcf8'}>
                <td style={{ padding:'10px 14px', color:'#9a998f', fontFamily:'monospace', fontSize:'12px' }}>{g.numero||i+1}</td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ fontWeight:600, color:g.estado==='PAGADO'?'#16a34a':'#1a1915' }}>{g.nombre}</div>
                  {g.notas && <div style={{ fontSize:'11px', color:'#9a998f', marginTop:'2px' }}>{g.notas}</div>}
                </td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'#1a1915' }}>RD$ {(g.monto_total||0).toLocaleString('en-US',{maximumFractionDigits:0})}</td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', color:'#16a34a', fontWeight:600 }}>RD$ {(g.monto_pagado||0).toLocaleString('en-US',{maximumFractionDigits:0})}</td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', color:g.deuda_pendiente>0?'#dc2626':'#9a998f', fontWeight:600 }}>RD$ {(g.deuda_pendiente||0).toLocaleString('en-US',{maximumFractionDigits:0})}</td>
                <td style={{ padding:'10px 14px', textAlign:'center' }} onClick={e => { e.stopPropagation(); marcarPagado(g); }}>
                  <button style={{ padding:'4px 12px', borderRadius:'20px', fontSize:'11px', fontWeight:700, border:'none', cursor:'pointer', background:g.estado==='PAGADO'?'#dcfce7':'#fff7ed', color:g.estado==='PAGADO'?'#14532d':'#c2410c' }}>
                    {g.estado==='PAGADO'?'✓ Pagado':'● Pendiente'}
                  </button>
                </td>
                <td style={{ padding:'10px 14px', textAlign:'center', fontSize:'12px', color:'#9a998f' }}>{g.fecha_pago||'—'}</td>
                <td style={{ padding:'10px 14px', textAlign:'center' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleSuspendido(g)} title={g.suspendido ? 'Reactivar' : 'Suspender'} style={{ padding:'3px 8px', borderRadius:'20px', fontSize:'10px', fontWeight:700, border:'none', cursor:'pointer', background:g.suspendido?'#fee2e2':'#f1f5f9', color:g.suspendido?'#dc2626':'#64748b' }}>
                    {g.suspendido ? 'Susp.' : '—'}
                  </button>
                </td>
                <td style={{ padding:'10px 14px', textAlign:'center' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => eliminar(g.id)} style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid #fca5a5', background:'#fee2e2', color:'#dc2626', fontSize:'11px', cursor:'pointer' }}>
                    <Trash2 size={12}/>
                  </button>
                </td>
              </tr>
            );
              return (<>
                {activos.map((g, i) => renderFila(g, i))}
                {soloDeuda.length > 0 && (
                  <tr><td colSpan={9} style={{ padding:'8px 14px', background:'#fff7ed', borderTop:'2px solid #fed7aa', borderBottom:'1px solid #fed7aa' }}>
                    <span style={{ fontSize:'10px', fontWeight:700, color:'#ea580c', textTransform:'uppercase', letterSpacing:'0.08em' }}>⚠ Deuda de meses anteriores — {soloDeuda.length} grupos</span>
                  </td></tr>
                )}
                {soloDeuda.map((g, i) => renderFila(g, activos.length + i))}
              </>);
            })()}
          </tbody>
        </table>
        {grupos.length > 0 && (
          <div style={{ padding:'10px 16px', borderTop:'1px solid #e0dfd8', background:'#f0efe9', display:'flex', justifyContent:'space-between', fontSize:'12px', color:'#9a998f' }}>
            <span>Cobrado: <strong style={{ color:'#16a34a' }}>RD$ {totalPagado.toLocaleString('en-US',{maximumFractionDigits:0})}</strong></span>
            <span>Deuda acumulada: <strong style={{ color:'#dc2626' }}>RD$ {totalDeuda.toLocaleString('en-US',{maximumFractionDigits:0})}</strong></span>
            <span>Pendiente mes: <strong style={{ color:'#ea580c' }}>RD$ {totalPendiente.toLocaleString('en-US',{maximumFractionDigits:0})}</strong></span>
          </div>
        )}
      </div>

      {/* PANEL DETALLE GRUPO */}
      {grupoSeleccionado && (
        <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'420px', background:'#fff', boxShadow:'-8px 0 32px rgba(0,0,0,0.12)', zIndex:9998, display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #e0dfd8', display:'flex', alignItems:'center', justifyContent:'space-between', background:grupoSeleccionado.estado==='PAGADO'?'#f0fdf4':'#faf9f5' }}>
            <div>
              <div style={{ fontSize:'16px', fontWeight:700, color:'#1a1915' }}>{grupoSeleccionado.nombre}</div>
              <div style={{ fontSize:'12px', color:'#9a998f', marginTop:'2px' }}>Grupo #{grupoSeleccionado.numero}</div>
            </div>
            <button onClick={() => setGrupoSeleccionado(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9a998f', padding:'4px' }}>
              <X size={20}/>
            </button>
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
            {/* Estado actual */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'16px' }}>
              <div style={{ background:'#f5f4ef', borderRadius:'10px', padding:'12px' }}>
                <div style={{ fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', marginBottom:'4px' }}>Monto este mes</div>
                <div style={{ fontSize:'18px', fontWeight:800, color:'#1a1915', fontFamily:'monospace' }}>RD$ {(grupoSeleccionado.monto_total||0).toLocaleString('en-US',{maximumFractionDigits:0})}</div>
              </div>
              <div style={{ background:grupoSeleccionado.deuda_pendiente>0?'#fff1f2':'#f0fdf4', borderRadius:'10px', padding:'12px' }}>
                <div style={{ fontSize:'10px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', marginBottom:'4px' }}>Deuda pendiente</div>
                <div style={{ fontSize:'18px', fontWeight:800, color:grupoSeleccionado.deuda_pendiente>0?'#dc2626':'#16a34a', fontFamily:'monospace' }}>RD$ {(grupoSeleccionado.deuda_pendiente||0).toLocaleString('en-US',{maximumFractionDigits:0})}</div>
              </div>
            </div>

            {/* Botón pagado */}
            <button onClick={() => marcarPagado(grupoSeleccionado)} style={{ width:'100%', padding:'10px', borderRadius:'10px', fontSize:'13px', fontWeight:700, border:'none', cursor:'pointer', background:grupoSeleccionado.estado==='PAGADO'?'#dcfce7':'#6366f1', color:grupoSeleccionado.estado==='PAGADO'?'#14532d':'#fff', marginBottom:'16px', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
              <DollarSign size={14}/> {grupoSeleccionado.estado==='PAGADO'?'Marcar como Pendiente':'Marcar como Pagado'}
            </button>

            {/* Notas */}
            <div style={{ marginBottom:'16px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'6px' }}>Notas</div>
              {editandoNota === grupoSeleccionado.id ? (
                <div style={{ display:'flex', gap:'6px' }}>
                  <input value={notaTemp} onChange={e => setNotaTemp(e.target.value)} style={{ flex:1, fontSize:'13px', padding:'8px 10px', border:'1px solid #6366f1', borderRadius:'8px', outline:'none' }} autoFocus onKeyDown={e => { if(e.key==='Enter') guardarNota(grupoSeleccionado); if(e.key==='Escape') setEditandoNota(null); }}/>
                  <button onClick={() => guardarNota(grupoSeleccionado)} style={{ padding:'8px 12px', borderRadius:'8px', border:'none', background:'#6366f1', color:'#fff', fontSize:'12px', cursor:'pointer' }}>Guardar</button>
                </div>
              ) : (
                <div onClick={() => { setEditandoNota(grupoSeleccionado.id); setNotaTemp(grupoSeleccionado.notas||''); }} style={{ padding:'10px', background:'#f5f4ef', borderRadius:'8px', fontSize:'13px', color:grupoSeleccionado.notas?'#3d3c35':'#b5b4ab', cursor:'pointer', minHeight:'40px' }}>
                  {grupoSeleccionado.notas || 'Clic para agregar nota...'}
                </div>
              )}
            </div>

            {/* Historial */}
            <div>
              <div style={{ fontSize:'11px', fontWeight:700, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
                <Clock size={12}/> Historial
              </div>
              {(grupoSeleccionado.historial||[]).length === 0 ? (
                <div style={{ fontSize:'13px', color:'#b5b4ab', textAlign:'center', padding:'20px' }}>Sin historial todavía</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {[...(grupoSeleccionado.historial||[])].reverse().map((h, i) => (
                    <div key={i} style={{ background:'#f5f4ef', borderRadius:'8px', padding:'10px 12px', borderLeft:'3px solid ' + (h.estado==='PAGADO'?'#16a34a':h.accion?.includes('Cierre')?'#6366f1':'#ea580c') }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                        <span style={{ fontSize:'12px', fontWeight:600, color:'#1a1915' }}>{h.mes || h.accion}</span>
                        <span style={{ fontSize:'11px', color:'#9a998f' }}>{new Date(h.fecha).toLocaleDateString('es-DO')}</span>
                      </div>
                      {h.monto_total !== undefined && (
                        <div style={{ fontSize:'12px', color:'#6b6a62' }}>
                          Total: RD${(h.monto_total||0).toLocaleString('en-US',{maximumFractionDigits:0})} ·
                          Pagado: RD${(h.monto_pagado||0).toLocaleString('en-US',{maximumFractionDigits:0})} ·
                          Estado: <span style={{ fontWeight:700, color:h.estado==='PAGADO'?'#16a34a':'#ea580c' }}>{h.estado}</span>
                        </div>
                      )}
                      {h.monto !== undefined && h.monto_total === undefined && (
                        <div style={{ fontSize:'12px', color:'#6b6a62' }}>Monto: RD${(h.monto||0).toLocaleString('en-US',{maximumFractionDigits:0})}</div>
                      )}
                    </div>
                  );
              return (<>
                {activos.map((g, i) => renderFila(g, i))}
                {soloDeuda.length > 0 && (
                  <tr><td colSpan={9} style={{ padding:'8px 14px', background:'#fff7ed', borderTop:'2px solid #fed7aa', borderBottom:'1px solid #fed7aa' }}>
                    <span style={{ fontSize:'10px', fontWeight:700, color:'#ea580c', textTransform:'uppercase', letterSpacing:'0.08em' }}>⚠ Deuda de meses anteriores — {soloDeuda.length} grupos</span>
                  </td></tr>
                )}
                {soloDeuda.map((g, i) => renderFila(g, activos.length + i))}
              </>);
            })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal teléfono */}
      {showConfigTel && (
        <div className="modal show">
          <div className="modal-content" style={{ maxWidth:'400px' }}>
            <div className="modal-header">
              <h2>Teléfono Sr. Junior</h2>
              <button className="close-btn" onClick={() => setShowConfigTel(false)}>×</button>
            </div>
            <div className="form-group">
              <label>Número de WhatsApp</label>
              <input type="tel" value={telefonoJunior} onChange={e => setTelefonoJunior(e.target.value)} placeholder="Ej: 18091234567"/>
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
