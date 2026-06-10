'use client';
import { useState, useEffect } from 'react';

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

    let nombre = match[1].trim();
    // Normalizar nombres
    nombre = nombre.replace(/^000/, '').trim();

    const monto = parseFloat(montoRaw.replace(/[$,]/g, '')) || 0;
    if (!nombre || monto === 0) return;

    grupos[nombre] = (grupos[nombre] || 0) + monto;
  });

  return grupos;
}

export default function TabGrupos({ clientes, session, currentUser, empresaActual, showToast }) {
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const procesar = () => {
    if (!texto.trim()) return;
    setProcesando(true);
    setTimeout(() => {
      const grupos = parsearReporte(texto);
      const items = Object.entries(grupos).map(([nombre, monto]) => {
        const clienteExistente = clientes.find(c =>
          c.nombre.toLowerCase().trim() === nombre.toLowerCase().trim()
        );
        return { nombre, monto, existe: !!clienteExistente, clienteId: clienteExistente?.id };
      }).sort((a, b) => b.monto - a.monto);
      setResultado(items);
      setProcesando(false);
    }, 300);
  };

  const aplicar = async () => {
    if (!resultado) return;
    setAplicando(true);
    const empresaId = session?.user?.empresa_id || empresaActual?.id;
    const usuario = currentUser || session?.user?.username || 'Sistema';
    let actualizados = 0, creados = 0;

    for (const item of resultado) {
      try {
        if (item.existe && item.clienteId) {
          await fetch('/api/clientes/' + item.clienteId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto: item.monto })
          });
          actualizados++;
        } else {
          await fetch('/api/clientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: item.nombre,
              monto: item.monto,
              estado: 'Cotizado',
              empresa_id: empresaId,
              creadoPor: usuario,
              mes: new Date().getMonth() + 1,
              año: new Date().getFullYear(),
              historial: [{ fecha: new Date().toISOString(), accion: 'Importado desde BlueLine', usuario }]
            })
          });
          creados++;
        }
      } catch(e) {}
    }

    setAplicando(false);
    setResultado(null);
    setTexto('');
    if (showToast) showToast(`✅ ${actualizados} actualizados · ${creados} creados`, 'success');
  };

  const totalMonto = resultado ? resultado.reduce((s, i) => s + i.monto, 0) : 0;
  const existentes = resultado ? resultado.filter(i => i.existe).length : 0;
  const nuevos = resultado ? resultado.filter(i => !i.existe).length : 0;

  return (
    <div>
      <div style={{ marginBottom:'1.25rem' }}>
        <div style={{ fontSize:'22px', fontWeight:700, color:'#1a1915', letterSpacing:'-0.03em' }}>Grupos BlueLine</div>
        <div style={{ fontSize:'13px', color:'#9a998f', marginTop:'3px' }}>Importa el reporte mensual de BlueLine y actualiza los montos automáticamente</div>
      </div>

      <div style={{ background:'#fff', border:'1px solid #e0dfd8', borderRadius:'12px', padding:'16px', marginBottom:'12px' }}>
        <div style={{ fontSize:'11px', fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Paso 1 — Pegar reporte</div>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          style={{ width:'100%', height:'130px', border:'1px solid #e0dfd8', borderRadius:'8px', padding:'10px', fontSize:'12px', fontFamily:'monospace', color:'#3d3c35', resize:'vertical', background:'#faf9f5', outline:'none' }}
          placeholder={'Pega aquí el reporte completo copiado desde BlueLine...\n\nFecha\tGénero\tConcepto\tCantidad\tPrecio x Unidad\tMonto\tBalance\n05/06/2026\tFactura\t...Junior_BlueLine Yuly Brito\t10\t$862.00\t$8,620.00\t...'}
        />
        <button
          onClick={procesar}
          disabled={!texto.trim() || procesando}
          style={{ marginTop:'8px', padding:'8px 20px', borderRadius:'8px', fontSize:'13px', fontWeight:700, border:'none', background: texto.trim() ? '#6366f1' : '#e0dfd8', color: texto.trim() ? '#fff' : '#9a998f', cursor: texto.trim() ? 'pointer' : 'not-allowed' }}>
          {procesando ? 'Procesando...' : '⚡ Procesar reporte'}
        </button>
      </div>

      {resultado && (
        <div style={{ background:'#fff', border:'1px solid #e0dfd8', borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', background:'#f0efe9', borderBottom:'1px solid #e0dfd8', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'0.08em' }}>Paso 2 — Revisar y aplicar</div>
            <div style={{ fontSize:'12px', color:'#9a998f' }}>{resultado.length} grupos · RD$ {totalMonto.toLocaleString('en-US', { maximumFractionDigits:0 })}</div>
          </div>

          <div style={{ maxHeight:'400px', overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead>
                <tr style={{ background:'#fafaf8', borderBottom:'1px solid #f0efe9' }}>
                  <th style={{ padding:'8px 16px', textAlign:'left', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase' }}>Cliente / Grupo</th>
                  <th style={{ padding:'8px 16px', textAlign:'right', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase' }}>Monto</th>
                  <th style={{ padding:'8px 16px', textAlign:'center', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase' }}>Estado</th>
                  <th style={{ padding:'8px 16px', textAlign:'center', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {resultado.map((item, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #f5f4ef', background: i % 2 === 0 ? '#fff' : '#fdfcf8' }}>
                    <td style={{ padding:'10px 16px', fontWeight:500, color:'#1a1915' }}>{item.nombre}</td>
                    <td style={{ padding:'10px 16px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'#1a1915' }}>
                      RD$ {item.monto.toLocaleString('en-US', { maximumFractionDigits:0 })}
                    </td>
                    <td style={{ padding:'10px 16px', textAlign:'center' }}>
                      {item.existe
                        ? <span style={{ fontSize:'11px', padding:'3px 8px', borderRadius:'20px', background:'#dcfce7', color:'#14532d', border:'1px solid #86efac' }}>✓ Existe</span>
                        : <span style={{ fontSize:'11px', padding:'3px 8px', borderRadius:'20px', background:'#fff7ed', color:'#c2410c', border:'1px solid #fcd9b4' }}>⚡ Nuevo</span>
                      }
                    </td>
                    <td style={{ padding:'10px 16px', textAlign:'center', fontSize:'11px', fontWeight:600, color: item.existe ? '#16a34a' : '#ea580c' }}>
                      {item.existe ? 'Actualizar monto' : 'Crear cliente'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding:'12px 16px', borderTop:'1px solid #e0dfd8', background:'#f0efe9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:'12px', color:'#9a998f' }}>
              <span style={{ color:'#16a34a', fontWeight:600 }}>{existentes} existentes</span> · <span style={{ color:'#ea580c', fontWeight:600 }}>{nuevos} nuevos</span>
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={() => { setResultado(null); setTexto(''); }} style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:600, border:'1px solid #e0dfd8', background:'#faf9f5', color:'#3d3c35', cursor:'pointer' }}>
                Cancelar
              </button>
              <button onClick={aplicar} disabled={aplicando} style={{ padding:'8px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:700, border:'none', background:'#16a34a', color:'#fff', cursor:'pointer' }}>
                {aplicando ? 'Aplicando...' : '✓ Aplicar todo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
