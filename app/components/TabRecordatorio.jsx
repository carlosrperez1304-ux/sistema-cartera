'use client';
import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Play, Pause, CheckCircle, Clock, Users } from 'lucide-react';

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const MESES_SIG = { ENERO:'FEBRERO', FEBRERO:'MARZO', MARZO:'ABRIL', ABRIL:'MAYO', MAYO:'JUNIO', JUNIO:'JULIO', JULIO:'AGOSTO', AGOSTO:'SEPTIEMBRE', SEPTIEMBRE:'OCTUBRE', OCTUBRE:'NOVIEMBRE', NOVIEMBRE:'DICIEMBRE', DICIEMBRE:'ENERO' };

function getMesActual() { return MESES[new Date().getMonth()]; }
function getAnioActual() { return new Date().getFullYear(); }

function getMensajeRecordatorio(cliente) {
  const hora = new Date().getHours();
  const saludo = hora >= 5 && hora < 12 ? 'Buenos días' : hora >= 12 && hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const mes = getMesActual();
  const anio = getAnioActual();
  const mesSig = MESES_SIG[mes];
  const monto = cliente.monto ? `$${parseFloat(cliente.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00';
  return `Saludos ${saludo}!\nLe contactamos para recordarle que la factura del mes de ${mes} ${anio}📃 aún está pendiente de pago.\n💠El plazo vence el día 15 DE ${mesSig} ${anio}.\n💰 Monto a pagar: ${monto}\n⚠️LOS PAGOS SE REALIZAN A NUESTRAS CUENTAS DE BANCOS⚠️\nCUENTAS:\nA nombre: 7LABS\n🟢Reservas: 248 013348 5\n🔵Popular:     782 6584 05\n🟢BHD:         1587 811 0015\n🧾RNC: 130-82698-6`;
}

export default function TabRecordatorio({ clientes, showToast }) {
  const [cola, setCola] = useState([]);
  const [enviados, setEnviados] = useState([]);
  const [activo, setActivo] = useState(false);
  const [indexActual, setIndexActual] = useState(0);
  const [countdown, setCountdown] = useState(120);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  // Filtrar clientes que necesitan recordatorio
  const clientesPendientes = (clientes || []).filter(c =>
    ['Notificado', 'Cotizado'].includes(c.estado) &&
    !c.suspendido &&
    c.contacto
  );

  useEffect(() => {
    // Cargar cola inicial
    setCola(clientesPendientes.map(c => ({ ...c, _enviado: false })));
  }, [clientes]);

  useEffect(() => {
    if (!activo) {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
      return;
    }

    const pendientes = cola.filter(c => !c._enviado);
    if (pendientes.length === 0) {
      setActivo(false);
      showToast('✅ Recordatorios completados', 'success');
      return;
    }

    setCountdown(120);

    // Enviar el primero inmediatamente
    enviarMensaje(pendientes[0]);

    // Countdown
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return 120;
        return prev - 1;
      });
    }, 1000);

    // Enviar siguiente cada 2 minutos
    intervalRef.current = setInterval(() => {
      setCola(prev => {
        const pendientes = prev.filter(c => !c._enviado);
        if (pendientes.length === 0) {
          clearInterval(intervalRef.current);
          clearInterval(countdownRef.current);
          setActivo(false);
          showToast('✅ Recordatorios completados', 'success');
          return prev;
        }
        enviarMensaje(pendientes[0]);
        setCountdown(120);
        return prev;
      });
    }, 120000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    };
  }, [activo]);

  async function enviarMensaje(cliente) {
    try {
      const mensaje = getMensajeRecordatorio(cliente);
      if (window.electronAPI?.whatsappEnviarMensaje) {
        await window.electronAPI.whatsappEnviarMensaje(cliente.contacto, mensaje);
      }
      setCola(prev => prev.map(c => c.id === cliente.id ? { ...c, _enviado: true } : c));
      setEnviados(prev => [...prev, cliente.id]);
      showToast(`✅ Recordatorio enviado a ${cliente.nombre}`, 'success');
    } catch (err) {
      showToast(`❌ Error enviando a ${cliente.nombre}`, 'error');
    }
  }

  const pendientes = cola.filter(c => !c._enviado);
  const completados = cola.filter(c => c._enviado);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Recordatorio de Cobro</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {pendientes.length} clientes pendientes · Envío automático cada 2 minutos
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activo && (
            <div style={{ fontSize: '12px', color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '20px', padding: '4px 12px' }}>
              ⏱ Próximo en {countdown}s
            </div>
          )}
          <button
            onClick={() => setActivo(!activo)}
            disabled={pendientes.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              border: 'none', cursor: pendientes.length === 0 ? 'not-allowed' : 'pointer',
              background: activo ? '#ef4444' : '#16a34a', color: 'white',
              opacity: pendientes.length === 0 ? 0.5 : 1
            }}
          >
            {activo ? <><Pause size={14}/> Pausar</> : <><Play size={14}/> Iniciar Cola</>}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Total</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{cola.length}</div>
        </div>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '10px', color: '#ea580c', textTransform: 'uppercase', marginBottom: '4px' }}>Pendientes</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#ea580c' }}>{pendientes.length}</div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '10px', color: '#16a34a', textTransform: 'uppercase', marginBottom: '4px' }}>Enviados</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#16a34a' }}>{completados.length}</div>
        </div>
      </div>

      {/* Lista */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cliente</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Monto</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estado</span>
        </div>
        {cola.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            No hay clientes pendientes de recordatorio
          </div>
        )}
        {cola.map((cliente, i) => (
          <div key={cliente.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: '10px',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            background: cliente._enviado ? '#f0fdf4' : 'transparent',
            opacity: cliente._enviado ? 0.7 : 1,
            transition: 'all 0.3s'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: cliente._enviado ? '#16a34a' : '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                {cliente._enviado ? <CheckCircle size={14}/> : cliente.nombre[0]}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', textDecoration: cliente._enviado ? 'line-through' : 'none' }}>{cliente.nombre}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cliente.contacto}</div>
              </div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
              ${parseFloat(cliente.monto || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{
                fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 600,
                background: cliente._enviado ? '#dcfce7' : '#fff7ed',
                color: cliente._enviado ? '#16a34a' : '#ea580c'
              }}>
                {cliente._enviado ? '✓ Enviado' : 'Pendiente'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
