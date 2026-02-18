'use client';
import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { signIn, signOut, useSession } from 'next-auth/react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function App() {
  const { data: session } = useSession();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState('');

  useEffect(() => {
    const logged = localStorage.getItem('isLoggedIn') === 'true';
    const user = localStorage.getItem('currentUser') || '';
    setIsAuthenticated(logged);
    setCurrentUser(user);
  }, []);

  const VALID_USERS = { 'CPEREZ': { pass: 'admin123', rol: 'admin' }, 'admin': { pass: 'admin', rol: 'admin' }, 'viewer': { pass: 'viewer123', rol: 'viewer' } };
  const ADMIN_EMAILS = ['carlosperez@gmail.com']; // agrega aquí los correos que son admin
  const esAdmin = session ? ADMIN_EMAILS.includes(session.user.email) : (VALID_USERS[currentUser]?.rol === 'admin');
  const soloLectura = !esAdmin;

  const handleLogin = (e) => {
    e.preventDefault();
    if (VALID_USERS[username] && VALID_USERS[username].pass === password) {
      setIsAuthenticated(true);
      setCurrentUser(username);
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('currentUser', username);
      setLoginError('');
    } else {
      setLoginError('❌ Usuario o contraseña incorrectos');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('currentUser');
    setUsername('');
    setPassword('');
  };

  const cargarDatos = () => {
    if (typeof window === 'undefined') return [];
    const datosGuardados = localStorage.getItem('cartera-clientes-v2');
    if (datosGuardados) {
      const parsed = JSON.parse(datosGuardados);
      return parsed.map(c => ({ ...c, monto: c.monto !== undefined ? c.monto : '', pagosRealizados: c.pagosRealizados || [] }));
    }
    return [];
  };

  const [clientes, setClientes] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [historialMeses, setHistorialMeses] = useState({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setClientes(cargarDatos());
    const savedCreditos = localStorage.getItem('creditos-v1');
    setCreditos(savedCreditos ? JSON.parse(savedCreditos) : []);
    const savedHistorial = localStorage.getItem('historial-meses-v1');
    setHistorialMeses(savedHistorial ? JSON.parse(savedHistorial) : {});
    setHydrated(true);
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [showNotaModal, setShowNotaModal] = useState(false);
  const [showDescargaMesModal, setShowDescargaMesModal] = useState(false);
  const [notaClienteId, setNotaClienteId] = useState(null);
  const [notaTexto, setNotaTexto] = useState('');
  const [editingCliente, setEditingCliente] = useState(null);
  const [formData, setFormData] = useState({ id: '', nombre: '', contacto: '', estado: 'Cotizado', fechaCotizacion: '', fechaNotificacion: '', fechaPago: '', fechaFacturacion: '', fechaSuspension: '', mes: '', año: '', monto: '', comentario: '', historial: [] });
  const [activeTab, setActiveTab] = useState('cartera');
  const [darkMode, setDarkMode] = useState(false);
  const [vistaCards, setVistaCards] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);
  const [showCreditoModal, setShowCreditoModal] = useState(false);
  const [editingCredito, setEditingCredito] = useState(null);
  const [creditoFormData, setCreditoFormData] = useState({ id: '', numeroOrden: '', cliente: '', monto: '', fechaInicio: '', plazoMeses: '', fechaVencimiento: '', estado: 'Activo', comentario: '', historial: [], abonos: [] });
  const [nuevoAbono, setNuevoAbono] = useState('');
  const [mostrarAutocomplete, setMostrarAutocomplete] = useState(false);
  const [clientesFiltradosAuto, setClientesFiltradosAuto] = useState([]);
  const [selectedAutoIndex, setSelectedAutoIndex] = useState(-1);
  const [ordenarPor, setOrdenarPor] = useState('prioridad');
  const [direccionOrden, setDireccionOrden] = useState('desc');
  const [paginaActual, setPaginaActual] = useState(1);
  const ITEMS_POR_PAGINA = 15;
  const [editingMontoId, setEditingMontoId] = useState(null);
  const [tempMonto, setTempMonto] = useState('');
  const [editingCreditoMontoId, setEditingCreditoMontoId] = useState(null);
  const [tempCreditoMonto, setTempCreditoMonto] = useState('');
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [pagoClienteTarget, setPagoClienteTarget] = useState(null);
  const [showHistorialPagosModal, setShowHistorialPagosModal] = useState(false);
  const [historialPagosCliente, setHistorialPagosCliente] = useState(null);
  const [pagoMonto, setPagoMonto] = useState('');
  const [showPagoCreditoModal, setShowPagoCreditoModal] = useState(false);
  const [pagoCreditoTarget, setPagoCreditoTarget] = useState(null);
  const [pagoCreditoMonto, setPagoCreditoMonto] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [showBusquedaGlobal, setShowBusquedaGlobal] = useState(false);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [whatsappCliente, setWhatsappCliente] = useState(null);
  const [whatsappMensaje, setWhatsappMensaje] = useState('');
  const [showCalendario, setShowCalendario] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [vistaKanban, setVistaKanban] = useState(false);

  const obtenerMesActual = () => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  };

  const [mesVisualizando, setMesVisualizando] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    if (hydrated) localStorage.setItem('historial-meses-v1', JSON.stringify(historialMeses));
  }, [historialMeses, hydrated]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'n' && !e.ctrlKey) { setActiveTab('cartera'); abrirModal(); }
      if (e.key === 'c' && !e.ctrlKey) setActiveTab('cartera');
      if (e.key === 'r' && !e.ctrlKey) setActiveTab('credito');
      if (e.key === 'd' && !e.ctrlKey) setDarkMode(m => !m);
      if (e.key === 'f' && !e.ctrlKey) setShowBusquedaGlobal(true);
      if (e.key === 'Escape') { setShowBusquedaGlobal(false); setBusquedaGlobal(''); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.autocomplete-container')) setMostrarAutocomplete(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const verificarAlertasCreditos = () => {
      const hoy = new Date();
      let cambios = false;
      const updated = creditos.map(credito => {
        if (credito.estado === 'Activo' || credito.estado === 'Por Vencer') {
          const fechaVenc = new Date(credito.fechaVencimiento);
          const diffDays = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
          let nuevoEstado = diffDays < 0 ? 'Vencido' : diffDays <= 7 ? 'Por Vencer' : 'Activo';
          if (nuevoEstado !== credito.estado) { cambios = true; return { ...credito, estado: nuevoEstado }; }
        }
        return credito;
      });
      if (cambios) setCreditos(updated);
    };
    verificarAlertasCreditos();
    const interval = setInterval(verificarAlertasCreditos, 3600000);
    return () => clearInterval(interval);
  }, [creditos, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const verificarVencimientos = () => {
      const hoy = new Date();
      if (hoy.getDate() >= 16) {
        const updated = clientes.map(cliente => {
          if (!['Pagado','Facturado','Vencido','No Generaron'].includes(cliente.estado)) {
            if (parseInt(cliente.mes) === hoy.getMonth() + 1 && parseInt(cliente.año) === hoy.getFullYear()) {
              return { ...cliente, estado: 'Vencido', historial: [...(cliente.historial||[]), { fecha: hoy.toISOString(), accion: 'Movido automáticamente a Vencido (día 16)', usuario: 'Sistema' }] };
            }
          }
          return cliente;
        });
        if (JSON.stringify(updated) !== JSON.stringify(clientes)) setClientes(updated);
      }
    };
    verificarVencimientos();
    const interval = setInterval(verificarVencimientos, 3600000);
    return () => clearInterval(interval);
  }, [clientes, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('cartera-clientes-v2', JSON.stringify(clientes));
    const indicator = document.getElementById('save-indicator');
    if (indicator && clientes.length > 0) {
      indicator.style.opacity = '1';
      setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
    }
  }, [clientes, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('creditos-v1', JSON.stringify(creditos));
  }, [creditos, hydrated]);

  const datosActuales = mesVisualizando === obtenerMesActual()
    ? { clientes, creditos }
    : (historialMeses[mesVisualizando] || { clientes: [], creditos: [] });

  const calcularSaldoCliente = (cliente) => {
    const monto = parseFloat(cliente.monto) || 0;
    const pagado = (cliente.pagosRealizados || []).reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    return { monto, pagado, pendiente: Math.max(0, monto - pagado) };
  };

  const calcularSaldoCredito = (credito) => {
    const total = parseFloat(credito.monto) || 0;
    const abonado = (credito.abonos || []).reduce((s, a) => s + (parseFloat(a.monto) || 0), 0);
    return { total, abonado, pendiente: Math.max(0, total - abonado) };
  };

  const calcularSaldosCredito = (monto, abonos = []) => {
    const total = parseFloat(monto || 0);
    const abonado = abonos.reduce((sum, a) => sum + parseFloat(a.monto || 0), 0);
    return { total, abonado, pendiente: total - abonado };
  };

  const fmtMonto = (val, count) => {
    const n = parseFloat(val) || 0;
    if (n <= 0) return count > 0 ? '$0' : null;
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const getDiasRestantes = (fechaVencimiento) => {
    const fechaVenc = new Date(fechaVencimiento);
    const hoy = new Date();
    return Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
  };

  const estadisticas = useMemo(() => {
    const clientesData = datosActuales.clientes;
    const total = clientesData.length;
    const sumM = (arr) => arr.reduce((acc, c) => acc + (parseFloat(c.monto) || 0), 0);
    const sumPend = (arr) => arr.reduce((acc, c) => {
      const m = parseFloat(c.monto) || 0;
      const p = (c.pagosRealizados || []).reduce((s, x) => s + (parseFloat(x.monto) || 0), 0);
      return acc + Math.max(0, m - p);
    }, 0);
    const cotizados = clientesData.filter(c => c.estado === 'Cotizado');
    const notificados = clientesData.filter(c => c.estado === 'Notificado');
    const pagados = clientesData.filter(c => c.estado === 'Pagado');
    const facturados = clientesData.filter(c => c.estado === 'Facturado');
    const vencidos = clientesData.filter(c => c.estado === 'Vencido');
    const suspendidos = clientesData.filter(c => c.suspendido === true);
    const noGeneraron = clientesData.filter(c => c.estado === 'No Generaron');
    return {
      cotizado: cotizados.length, notificado: notificados.length, pagado: pagados.length,
      facturado: facturados.length, vencido: vencidos.length, suspendido: suspendidos.length,
      noGeneraron: noGeneraron.length, total,
      montoCotizado: sumM(cotizados), montoNotificado: sumM(notificados), montoPagado: sumM(pagados),
      montoFacturado: sumM(facturados), montoVencido: sumM(vencidos), montoSuspendido: sumPend(suspendidos),
      cotizadoPct: total > 0 ? ((cotizados.length / total) * 100).toFixed(1) : 0,
      notificadoPct: total > 0 ? ((notificados.length / total) * 100).toFixed(1) : 0,
      pagadoPct: total > 0 ? ((pagados.length / total) * 100).toFixed(1) : 0,
      facturadoPct: total > 0 ? ((facturados.length / total) * 100).toFixed(1) : 0,
      vencidoPct: total > 0 ? ((vencidos.length / total) * 100).toFixed(1) : 0,
      suspendidoPct: total > 0 ? ((suspendidos.length / total) * 100).toFixed(1) : 0,
      noGeneraronPct: total > 0 ? ((noGeneraron.length / total) * 100).toFixed(1) : 0,
    };
  }, [datosActuales.clientes]);

  const creditoStats = useMemo(() => {
    const creditosData = datosActuales.creditos;
    const activo = creditosData.filter(c => c.estado === 'Activo').length;
    const porVencer = creditosData.filter(c => c.estado === 'Por Vencer').length;
    const vencido = creditosData.filter(c => c.estado === 'Vencido').length;
    const pagado = creditosData.filter(c => c.estado === 'Pagado').length;
    const total = activo + porVencer + vencido + pagado;
    const totalMonto = creditosData.filter(c => c.estado === 'Activo' || c.estado === 'Por Vencer').reduce((sum, c) => sum + parseFloat(c.monto || 0), 0);
    const montoPagado = creditosData.filter(c => c.estado === 'Pagado').reduce((sum, c) => sum + parseFloat(c.monto || 0), 0);
    return {
      activo, porVencer, vencido, pagado, total,
      activoPct: total > 0 ? ((activo / total) * 100).toFixed(0) : 0,
      porVencerPct: total > 0 ? ((porVencer / total) * 100).toFixed(0) : 0,
      vencidoPct: total > 0 ? ((vencido / total) * 100).toFixed(0) : 0,
      pagadoPct: total > 0 ? ((pagado / total) * 100).toFixed(0) : 0,
      totalMonto, montoPagado,
    };
  }, [datosActuales.creditos]);

  const creditosAlerta = useMemo(() => datosActuales.creditos.filter(c => {
    if (c.estado !== 'Activo' && c.estado !== 'Por Vencer') return false;
    const diffDays = Math.ceil((new Date(c.fechaVencimiento) - new Date()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0;
  }), [datosActuales.creditos]);

  const creditosVencidos = useMemo(() => datosActuales.creditos.filter(c => c.estado === 'Vencido'), [datosActuales.creditos]);

  useEffect(() => {
    if (!creditosAlerta.length && !creditosVencidos.length) return;
    if (!('Notification' in window)) return;
    const enviarNotif = () => {
      if (creditosVencidos.length > 0) {
        new Notification('⚠️ CartaMaster - Créditos Vencidos', { body: `Tienes ${creditosVencidos.length} crédito(s) vencido(s) que requieren atención.`, icon: '/favicon.ico' });
      }
      if (creditosAlerta.length > 0) {
        new Notification('⏰ CartaMaster - Créditos por Vencer', { body: `${creditosAlerta.length} crédito(s) vencen en los próximos 7 días.`, icon: '/favicon.ico' });
      }
    };
    if (Notification.permission === 'granted') { enviarNotif(); }
    else if (Notification.permission !== 'denied') { Notification.requestPermission().then(p => { if (p === 'granted') enviarNotif(); }); }
  }, []);

  const clientesFiltrados = useMemo(() => {
    let resultado = datosActuales.clientes;
    if (searchTerm) resultado = resultado.filter(c => c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || (c.contacto || '').includes(searchTerm) || c.id.toString().includes(searchTerm));
    if (fechaDesde) resultado = resultado.filter(c => c.fechaCotizacion && c.fechaCotizacion >= fechaDesde);
    if (fechaHasta) resultado = resultado.filter(c => c.fechaCotizacion && c.fechaCotizacion <= fechaHasta);
    if (filter !== 'todos') {
      if (filter === 'no-generaron') resultado = resultado.filter(c => c.estado === 'No Generaron');
      else resultado = resultado.filter(c => c.estado.toLowerCase() === filter);
    }
    resultado = [...resultado].sort((a, b) => {
      let comparacion = 0;
      if (ordenarPor === 'prioridad') {
        const p = { 'Vencido': 1, 'Notificado': 2, 'Cotizado': 3, 'Pagado': 4, 'Facturado': 5, 'No Generaron': 6 };
        comparacion = (p[a.estado] || 999) - (p[b.estado] || 999);
      } else if (ordenarPor === 'id') comparacion = parseInt(a.id) - parseInt(b.id);
      else if (ordenarPor === 'nombre') comparacion = a.nombre.localeCompare(b.nombre);
      else if (ordenarPor === 'monto') comparacion = parseFloat(a.monto || 0) - parseFloat(b.monto || 0);
      return direccionOrden === 'asc' ? comparacion : -comparacion;
    });
    return resultado;
  }, [datosActuales.clientes, searchTerm, filter, ordenarPor, direccionOrden]);

  const totalPaginas = Math.ceil(clientesFiltrados.length / ITEMS_POR_PAGINA);
  const clientesPaginados = clientesFiltrados.slice((paginaActual - 1) * ITEMS_POR_PAGINA, paginaActual * ITEMS_POR_PAGINA);

  const getPaginasAMostrar = () => {
    if (totalPaginas <= 5) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
    if (paginaActual <= 3) return [1, 2, 3, '...', totalPaginas];
    if (paginaActual >= totalPaginas - 2) return [1, '...', totalPaginas - 2, totalPaginas - 1, totalPaginas];
    return [1, '...', paginaActual, '...', totalPaginas];
  };

  const esClienteActivo = (cliente) => cliente.fechaCotizacion && cliente.fechaCotizacion !== '' && cliente.estado !== 'No Generaron';
  const esModoPasado = mesVisualizando !== obtenerMesActual();
  const esDespuesDel15 = new Date().getDate() >= 16;

  const abrirModal = (cliente = null) => {
    if (cliente) { setEditingCliente(cliente); setFormData(cliente); }
    else {
      const hoy = new Date();
      const nuevoId = clientes.length > 0 ? Math.max(...clientes.map(c => parseInt(c.id) || 0)) + 1 : 1;
      setEditingCliente(null);
      setFormData({ id: nuevoId, nombre: '', contacto: '', estado: 'Cotizado', fechaCotizacion: hoy.toISOString().split('T')[0], fechaNotificacion: '', fechaPago: '', fechaFacturacion: '', fechaSuspension: '', mes: (hoy.getMonth() + 1).toString(), año: hoy.getFullYear().toString(), monto: '', comentario: '', historial: [] });
    }
    setShowModal(true);
  };

  const cerrarModal = () => { setShowModal(false); setEditingCliente(null); };

  const guardarCliente = (e) => {
    e.preventDefault();
    const idDuplicado = clientes.find(c => c.id === parseInt(formData.id) && (!editingCliente || c.id !== editingCliente.id));
    if (idDuplicado) { alert(`El ID ${formData.id} ya existe.`); return; }
    const nuevoHistorial = [...(formData.historial || [])];
    nuevoHistorial.push({ fecha: new Date().toISOString(), accion: editingCliente ? `Actualizado - Estado: ${formData.estado}` : `Creado - Estado: ${formData.estado}`, usuario: 'CPEREZ' });
    const clienteConHistorial = { ...formData, id: parseInt(formData.id), historial: nuevoHistorial };
    if (editingCliente) setClientes(clientes.map(c => c.id === editingCliente.id ? clienteConHistorial : c));
    else setClientes([...clientes, clienteConHistorial]);
    cerrarModal();
  };

  const eliminarCliente = (id) => { if (confirm('¿Eliminar este cliente?')) setClientes(clientes.filter(c => c.id !== id)); };

  const abrirNotaModal = (cliente) => { setNotaClienteId(cliente.id); setNotaTexto(cliente.nota || ''); setShowNotaModal(true); };
  const guardarNota = () => { setClientes(clientes.map(c => c.id === notaClienteId ? { ...c, nota: notaTexto } : c)); setShowNotaModal(false); };

  const iniciarEdicionMonto = (cliente) => { setEditingMontoId(cliente.id); setTempMonto(cliente.monto || ''); };
  const guardarMontoInline = (clienteId) => {
    if (tempMonto === '' || isNaN(parseFloat(tempMonto))) { showToast('Monto inválido', 'error'); return; }
    setClientes(clientes.map(c => c.id === clienteId ? { ...c, monto: tempMonto, historial: [...(c.historial || []), { fecha: new Date().toISOString(), accion: `Monto actualizado a $${tempMonto}`, usuario: 'CPEREZ' }] } : c));
    setEditingMontoId(null); setTempMonto('');
  };
  const cancelarEdicionMonto = () => { setEditingMontoId(null); setTempMonto(''); };

  const iniciarEdicionCreditoMonto = (credito) => { setEditingCreditoMontoId(credito.id); setTempCreditoMonto(credito.monto || ''); };
  const guardarCreditoMontoInline = (creditoId) => {
    if (tempCreditoMonto === '' || isNaN(parseFloat(tempCreditoMonto))) { showToast('Monto inválido', 'error'); return; }
    setCreditos(creditos.map(c => c.id === creditoId ? { ...c, monto: tempCreditoMonto, historial: [...(c.historial || []), { fecha: new Date().toISOString(), accion: `Monto actualizado a $${tempCreditoMonto}`, usuario: 'CPEREZ' }] } : c));
    setEditingCreditoMontoId(null); setTempCreditoMonto('');
  };
  const cancelarEdicionCreditoMonto = () => { setEditingCreditoMontoId(null); setTempCreditoMonto(''); };

  const abrirPagoModal = (cliente) => { setPagoClienteTarget(cliente); setPagoMonto(''); setShowPagoModal(true); };
  const confirmarPago = () => {
    if (!pagoClienteTarget) return;
    const montoPagado = parseFloat(pagoMonto);
    if (!montoPagado || montoPagado <= 0) { showToast('Monto inválido', 'error'); return; }
    const saldo = calcularSaldoCliente(pagoClienteTarget);
    if (montoPagado > saldo.pendiente + 0.001) { alert('El monto supera el saldo pendiente'); return; }
    const nuevoPago = { id: Date.now(), monto: montoPagado, fecha: new Date().toISOString(), fechaFormato: new Date().toLocaleDateString('es-DO') };
    const pagosActualizados = [...(pagoClienteTarget.pagosRealizados || []), nuevoPago];
    const totalPagado = pagosActualizados.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    const montoTotal = parseFloat(pagoClienteTarget.monto) || 0;
    const pagadoCompleto = totalPagado >= montoTotal - 0.001;
    const clienteActualizado = { ...pagoClienteTarget, pagosRealizados: pagosActualizados, estado: pagadoCompleto ? 'Pagado' : pagoClienteTarget.estado, fechaPago: pagadoCompleto ? new Date().toISOString().split('T')[0] : pagoClienteTarget.fechaPago, historial: [...(pagoClienteTarget.historial || []), { fecha: new Date().toISOString(), accion: `Pago registrado: ${montoPagado.toLocaleString()} / Total: ${totalPagado.toLocaleString()} de ${montoTotal.toLocaleString()}`, usuario: 'CPEREZ' }] };
    setClientes(clientes.map(c => c.id === pagoClienteTarget.id ? clienteActualizado : c));
    setShowPagoModal(false); setPagoClienteTarget(null); setPagoMonto('');
  };

  const abrirPagoCreditoModal = (credito) => { setPagoCreditoTarget(credito); setPagoCreditoMonto(''); setShowPagoCreditoModal(true); };
  const confirmarPagoCredito = () => {
    if (!pagoCreditoTarget) return;
    const montoPagado = parseFloat(pagoCreditoMonto);
    if (!montoPagado || montoPagado <= 0) { showToast('Monto inválido', 'error'); return; }
    const saldo = calcularSaldoCredito(pagoCreditoTarget);
    if (montoPagado > saldo.pendiente + 0.001) { alert('El monto supera el saldo pendiente'); return; }
    const nuevoAbonoObj = { id: Date.now(), monto: montoPagado, fecha: new Date().toISOString(), fechaFormato: new Date().toLocaleDateString('es-DO') };
    const abonosActualizados = [...(pagoCreditoTarget.abonos || []), nuevoAbonoObj];
    const totalAbonado = abonosActualizados.reduce((s, a) => s + (parseFloat(a.monto) || 0), 0);
    const montoTotal = parseFloat(pagoCreditoTarget.monto) || 0;
    const pagadoCompleto = totalAbonado >= montoTotal - 0.001;
    const creditoActualizado = { ...pagoCreditoTarget, abonos: abonosActualizados, estado: pagadoCompleto ? 'Pagado' : pagoCreditoTarget.estado, fechaPagoC: pagadoCompleto ? new Date().toISOString().split('T')[0] : pagoCreditoTarget.fechaPagoC, historial: [...(pagoCreditoTarget.historial || []), { fecha: new Date().toISOString(), accion: `Pago: ${montoPagado.toLocaleString()} / Total abonado: ${totalAbonado.toLocaleString()} de ${montoTotal.toLocaleString()}`, usuario: 'CPEREZ' }] };
    setCreditos(creditos.map(c => c.id === pagoCreditoTarget.id ? creditoActualizado : c));
    setShowPagoCreditoModal(false); setPagoCreditoTarget(null); setPagoCreditoMonto('');
  };

  const cambiarOrdenamiento = (campo) => {
    if (ordenarPor === campo) setDireccionOrden(direccionOrden === 'asc' ? 'desc' : 'asc');
    else { setOrdenarPor(campo); setDireccionOrden(campo === 'prioridad' ? 'asc' : 'desc'); }
    setPaginaActual(1);
  };

  const abrirCreditoModal = (credito = null) => {
    setNuevoAbono('');
    if (credito) { setEditingCredito(credito); setCreditoFormData({ ...credito, abonos: credito.abonos || [] }); }
    else {
      setEditingCredito(null);
      const nuevoId = creditos.length > 0 ? Math.max(...creditos.map(c => c.id)) + 1 : 1;
      setCreditoFormData({ id: nuevoId, numeroOrden: '', cliente: '', monto: '', fechaInicio: new Date().toISOString().split('T')[0], plazoMeses: '', fechaVencimiento: '', estado: 'Activo', comentario: '', historial: [], abonos: [] });
    }
    setShowCreditoModal(true);
  };

  const cerrarCreditoModal = () => { setShowCreditoModal(false); setEditingCredito(null); setNuevoAbono(''); setMostrarAutocomplete(false); setClientesFiltradosAuto([]); setSelectedAutoIndex(-1); };

  const manejarCambioCliente = (valor) => {
    setCreditoFormData({ ...creditoFormData, cliente: valor });
    if (valor.trim().length > 0) {
      const filtrados = clientes.filter(c => c.nombre.toLowerCase().includes(valor.toLowerCase())).slice(0, 5);
      setClientesFiltradosAuto(filtrados); setMostrarAutocomplete(filtrados.length > 0); setSelectedAutoIndex(-1);
    } else { setMostrarAutocomplete(false); setClientesFiltradosAuto([]); }
  };

  const seleccionarClienteAutocomplete = (cliente) => {
    const fecha = new Date();
    const numeroOrdenSugerido = `ORD-${cliente.id}-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    setCreditoFormData({ ...creditoFormData, cliente: cliente.nombre, numeroOrden: creditoFormData.numeroOrden || numeroOrdenSugerido });
    setMostrarAutocomplete(false); setClientesFiltradosAuto([]); setSelectedAutoIndex(-1);
  };

  const manejarTecladoAutocomplete = (e) => {
    if (!mostrarAutocomplete || clientesFiltradosAuto.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedAutoIndex(prev => prev < clientesFiltradosAuto.length - 1 ? prev + 1 : prev); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedAutoIndex(prev => prev > 0 ? prev - 1 : -1); }
    else if (e.key === 'Enter' && selectedAutoIndex >= 0) { e.preventDefault(); seleccionarClienteAutocomplete(clientesFiltradosAuto[selectedAutoIndex]); }
    else if (e.key === 'Escape') { setMostrarAutocomplete(false); setSelectedAutoIndex(-1); }
  };

  const agregarAbono = () => {
    const monto = parseFloat(nuevoAbono);
    if (!monto || monto <= 0) { showToast('Monto inválido', 'error'); return; }
    const abonos = creditoFormData.abonos || [];
    const totalAbonado = abonos.reduce((sum, a) => sum + a.monto, 0);
    const montoCredito = parseFloat(creditoFormData.monto || 0);
    if (totalAbonado + monto > montoCredito) { alert(`Excede el saldo. Pendiente: $${(montoCredito - totalAbonado).toFixed(2)}`); return; }
    setCreditoFormData({ ...creditoFormData, abonos: [...abonos, { id: Date.now(), monto, fecha: new Date().toISOString(), fechaFormato: new Date().toLocaleDateString('es-DO') }] });
    setNuevoAbono('');
  };

  const eliminarAbono = (abonoId) => { if (confirm('¿Eliminar este abono?')) setCreditoFormData({ ...creditoFormData, abonos: creditoFormData.abonos.filter(a => a.id !== abonoId) }); };

  const guardarCredito = (e) => {
    e.preventDefault();
    const entrada = { ...creditoFormData, abonos: creditoFormData.abonos || [], historial: [...(creditoFormData.historial || []), { fecha: new Date().toISOString(), accion: editingCredito ? `Actualizado: ${creditoFormData.estado}` : `Creado: ${creditoFormData.estado}` }] };
    if (editingCredito) setCreditos(creditos.map(c => c.id === editingCredito.id ? entrada : c));
    else setCreditos([...creditos, entrada]);
    cerrarCreditoModal();
  };

  const eliminarCredito = (id) => { if (confirm('¿Eliminar este crédito?')) setCreditos(creditos.filter(c => c.id !== id)); };

  const obtenerNombreMes = (mesKey) => {
    const [año, mes] = mesKey.split('-');
    return new Date(parseInt(año), parseInt(mes) - 1, 1).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  };

  const obtenerMesesDisponibles = () => {
    const mesActual = obtenerMesActual();
    const mesesGuardados = Object.keys(historialMeses);
    return [...new Set([mesActual, ...mesesGuardados])].sort().reverse();
  };

  const exportarAExcel = (datos, nombreArchivo) => {
    const datosExcel = datos.map(cliente => ({ 'ID': cliente.id, 'Nombre': cliente.nombre, 'Contacto': cliente.contacto || '-', 'Estado': cliente.estado, 'Mes': cliente.mes, 'Año': cliente.año, 'Monto': `$${cliente.monto || '0'}`, 'Fecha Cotización': cliente.fechaCotizacion ? new Date(cliente.fechaCotizacion).toLocaleDateString('es-DO') : '-', 'Fecha Notificación': cliente.fechaNotificacion ? new Date(cliente.fechaNotificacion).toLocaleDateString('es-DO') : '-', 'Fecha Pago': cliente.fechaPago ? new Date(cliente.fechaPago).toLocaleDateString('es-DO') : '-', 'Fecha Facturación': cliente.fechaFacturacion ? new Date(cliente.fechaFacturacion).toLocaleDateString('es-DO') : '-', 'Comentario': cliente.comentario || '-' }));
    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, `${nombreArchivo}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportarTodosExcel = () => { if (!clientes.length) { showToast('No hay clientes', 'info'); return; } exportarAExcel(clientes, 'todos-los-clientes'); };

  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.map(x => x.id === id ? { ...x, removing: true } : x)), 3200);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };

  const backupJSON = () => {
    const datos = { clientes, creditos, historialMeses, fecha: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `backup-cartamaster-${new Date().toISOString().split('T')[0]}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importarDesdeExcel = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        const nuevos = data.map((row, i) => ({
          id: row['ID'] || row['id'] || Date.now() + i,
          nombre: row['Nombre'] || row['nombre'] || '',
          contacto: row['Contacto'] || row['contacto'] || '',
          estado: row['Estado'] || row['estado'] || 'Cotizado',
          mes: row['Mes'] || row['mes'] || new Date().getMonth() + 1,
          año: row['Año'] || row['año'] || new Date().getFullYear(),
          monto: row['Monto'] ? String(row['Monto']).replace(/[$,]/g, '') : '',
          fechaCotizacion: row['Fecha Cotización'] || '',
          comentario: row['Comentario'] || '',
          pagosRealizados: [], historial: [],
        })).filter(c => c.nombre);
        if (!nuevos.length) { alert('No se encontraron clientes en el archivo.'); return; }
        if (confirm(`Se importarán ${nuevos.length} clientes. ¿Continuar?`)) {
          setClientes(prev => [...prev, ...nuevos]);
          setShowImportModal(false);
          alert(`✅ ${nuevos.length} clientes importados correctamente.`);
        }
      } catch { showToast('Error al leer el archivo Excel', 'error'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const abrirWhatsappModal = (cliente) => {
    setWhatsappCliente(cliente);
    setWhatsappMensaje(`Hola ${cliente.nombre}, le contactamos para notificarle sobre su cuenta.\nEstado actual: *${cliente.estado}*\nMonto: *$${(parseFloat(cliente.monto)||0).toLocaleString('en-US')}*\n\nGracias.`);
    setShowWhatsappModal(true);
  };

  const enviarWhatsapp = () => {
    if (!whatsappCliente) return;
    const num = whatsappCliente.contacto.replace(/\D/g, '');
    window.open(`https://wa.me/1${num}?text=${encodeURIComponent(whatsappMensaje)}`, '_blank');
    setShowWhatsappModal(false);
  };

  const generarReciboPDF = (cliente, pago) => {
    import('jspdf').then(({ default: jsPDF }) => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFillColor(30, 45, 74); doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont(undefined, 'bold');
      doc.text('CartaMaster', 15, 18);
      doc.setFontSize(11); doc.setFont(undefined, 'normal');
      doc.text('Recibo de Pago', 15, 28);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-DO')}`, 150, 28);
      doc.setTextColor(30, 45, 74); doc.setFontSize(13); doc.setFont(undefined, 'bold');
      doc.text('Datos del Cliente', 15, 55);
      doc.setFont(undefined, 'normal'); doc.setFontSize(11);
      doc.text(`Nombre: ${cliente.nombre}`, 15, 65);
      doc.text(`ID: ${cliente.id}`, 15, 73);
      doc.text(`Contacto: ${cliente.contacto || '-'}`, 15, 81);
      doc.setFillColor(247, 249, 252); doc.rect(15, 95, 180, 40, 'F');
      doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(30, 45, 74);
      doc.text('Detalle del Pago', 20, 107);
      doc.setFont(undefined, 'normal'); doc.setFontSize(11);
      doc.text(`Monto pagado:`, 20, 117); doc.setFont(undefined, 'bold'); doc.setTextColor(5, 150, 105);
      doc.text(`$${parseFloat(pago.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 80, 117);
      doc.setFont(undefined, 'normal'); doc.setTextColor(30, 45, 74);
      doc.text(`Fecha de pago:`, 20, 126); doc.text(pago.fechaFormato || new Date(pago.fecha).toLocaleDateString('es-DO'), 80, 126);
      const s = calcularSaldoCliente(cliente);
      doc.text(`Saldo pendiente:`, 20, 135); doc.setTextColor(s.pendiente > 0 ? 220 : 5, s.pendiente > 0 ? 38 : 150, s.pendiente > 0 ? 38 : 105);
      doc.text(`$${s.pendiente.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 80, 135);
      doc.setTextColor(148, 163, 184); doc.setFontSize(9);
      doc.text('Este recibo fue generado automáticamente por CartaMaster.', 15, 270);
      doc.save(`recibo-${cliente.nombre.replace(/ /g,'-')}-${new Date().toISOString().split('T')[0]}.pdf`);
    });
  };

  const exportarPDF = () => {
    if (!clientes.length) { showToast('No hay clientes', 'info'); return; }
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(() => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('CartaMaster - Reporte de Cartera', 14, 15);
        doc.setFontSize(10); doc.setFont(undefined, 'normal');
        doc.text(`Generado: ${new Date().toLocaleDateString('es-DO')} | Total clientes: ${clientes.length}`, 14, 22);
        doc.autoTable({
          startY: 28,
          head: [['ID', 'Cliente', 'Contacto', 'Estado', 'Mes/Año', 'Monto', 'Cotización', 'Pago']],
          body: clientes.map(c => [c.id, c.nombre, c.contacto || '-', c.estado, `${c.mes}/${c.año}`, `$${(parseFloat(c.monto) || 0).toLocaleString('en-US')}`, c.fechaCotizacion ? new Date(c.fechaCotizacion).toLocaleDateString('es-DO') : '-', c.fechaPago ? new Date(c.fechaPago).toLocaleDateString('es-DO') : '-']),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [30, 45, 74], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [247, 249, 252] },
        });
        doc.save(`cartera-${new Date().toISOString().split('T')[0]}.pdf`);
      });
    });
  };

  const exportarCreditosPDF = () => {
    if (!creditos.length) { showToast('No hay créditos', 'info'); return; }
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(() => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('CartaMaster - Reporte de Créditos', 14, 15);
        doc.setFontSize(10); doc.setFont(undefined, 'normal');
        doc.text(`Generado: ${new Date().toLocaleDateString('es-DO')} | Total créditos: ${creditos.length}`, 14, 22);
        doc.autoTable({
          startY: 28,
          head: [['ID', 'Nº Orden', 'Cliente', 'Monto', 'Inicio', 'Vencimiento', 'Días Rest.', 'Estado']],
          body: creditos.map(c => [c.id, c.numeroOrden, c.cliente, `$${(parseFloat(c.monto) || 0).toLocaleString('en-US')}`, new Date(c.fechaInicio).toLocaleDateString('es-DO'), new Date(c.fechaVencimiento).toLocaleDateString('es-DO'), getDiasRestantes(c.fechaVencimiento), c.estado]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [30, 45, 74], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [247, 249, 252] },
        });
        doc.save(`creditos-${new Date().toISOString().split('T')[0]}.pdf`);
      });
    });
  };
  const exportarNoGeneraron = () => { const ng = clientes.filter(c => c.estado === 'No Generaron'); if (!ng.length) { showToast('No hay clientes con ese estado', 'info'); return; } exportarAExcel(ng, 'clientes-no-generaron'); };
  const exportarFacturados = () => { const f = clientes.filter(c => c.estado === 'Facturado'); if (!f.length) { showToast('No hay facturados', 'info'); return; } exportarAExcel(f, 'clientes-facturados'); };
  const exportarCreditosExcel = () => {
    if (!creditos.length) { showToast('No hay créditos', 'info'); return; }
    const datosExcel = creditos.map(credito => ({ 'ID': credito.id, 'Nº Orden': credito.numeroOrden, 'Cliente': credito.cliente, 'Monto': `$${parseFloat(credito.monto || 0).toLocaleString()}`, 'Fecha Inicio': new Date(credito.fechaInicio).toLocaleDateString('es-DO'), 'Plazo (meses)': credito.plazoMeses, 'Fecha Vencimiento': new Date(credito.fechaVencimiento).toLocaleDateString('es-DO'), 'Días Restantes': getDiasRestantes(credito.fechaVencimiento), 'Estado': credito.estado, 'Comentario': credito.comentario || '-' }));
    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Créditos');
    XLSX.writeFile(wb, `creditos-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportarDatos = () => {
    const dataStr = JSON.stringify(clientes, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url; link.download = `cartera-backup-${new Date().toISOString().split('T')[0]}.json`; link.click();
    URL.revokeObjectURL(url);
  };

  const descargarMesExcel = () => {
    const mesActual = obtenerMesActual();
    const mesNombre = obtenerNombreMes(mesActual);
    setHistorialMeses({ ...historialMeses, [mesActual]: { clientes: JSON.parse(JSON.stringify(clientes)), creditos: JSON.parse(JSON.stringify(creditos)), fechaGuardado: new Date().toISOString() } });
    const datosCartera = clientes.map(c => ({ 'ID': c.id, 'Cliente': c.nombre, 'Contacto': c.contacto || '', 'Estado': c.estado, 'Monto': parseFloat(c.monto || 0), 'Mes': c.mes + '/' + c.año, 'Fecha Cotización': c.fechaCotizacion || '', 'Fecha Notificación': c.fechaNotificacion || '', 'Fecha Pago': c.fechaPago || '', 'Fecha Facturación': c.fechaFacturacion || '', 'Suspendido': c.suspendido ? 'Sí' : 'No', 'Comentario': c.comentario || '' }));
    const datosCreditos2 = creditos.map(c => ({ 'ID': c.id, 'Nº Orden': c.numeroOrden, 'Cliente': c.cliente, 'Monto': parseFloat(c.monto || 0), 'Fecha Inicio': c.fechaInicio, 'Plazo (meses)': c.plazoMeses, 'Fecha Vencimiento': c.fechaVencimiento, 'Estado': c.estado, 'Comentario': c.comentario || '' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datosCartera), 'Cartera');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datosCreditos2), 'Créditos');
    XLSX.writeFile(wb, `Reporte_${mesNombre.replace(/ /g, '_')}.xlsx`);
    setShowDescargaMesModal(false);
    showToast(`Mes ${mesNombre} guardado correctamente`, 'success');
  };

  if (!hydrated) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f0f3f8', fontSize: '1.1rem', color: '#64748b' }}>Cargando...</div>;

  if (!isAuthenticated && !session) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <div className="login-logo">💼</div>
            <h1 className="login-title">CartaMaster</h1>
            <p className="login-subtitle">Sistema de Gestión de Cartera</p>
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-input-group">
              <label>Usuario</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ingresa tu usuario" autoFocus />
            </div>
            <div className="login-input-group">
              <label>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ingresa tu contraseña" />
            </div>
            {loginError && <div className="login-error">{loginError}</div>}
            <button type="submit" className="login-btn">🔐 Iniciar Sesión</button>
          </form>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>O continúa con</span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
          </div>
          <button onClick={() => signIn('google')} style={{ width: '100%', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '0.95rem', fontWeight: 600, color: '#374151', transition: 'all 0.2s', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
            onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; }}>
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-logo"><div className="dot">💼</div>CartaMaster</div>
          <div className="topbar-user">Bienvenido, <span>{session ? session.user.name : currentUser}</span> {soloLectura && <span style={{ background: '#fef9c3', color: '#854d0e', fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700, marginLeft: '0.3rem' }}>Solo lectura</span>}</div>
        </div>
        <div className="topbar-nav">
          <button className={`topbar-btn ${activeTab === 'cartera' ? 'active' : ''}`} onClick={() => setActiveTab('cartera')}>📊 Cartera</button>
          <button className={`topbar-btn ${activeTab === 'credito' ? 'active' : ''}`} onClick={() => setActiveTab('credito')}>💳 Crédito</button>
          <button className="topbar-btn" onClick={() => setShowBusquedaGlobal(true)} title="Búsqueda global (F)">🔍</button>
          <button className="topbar-btn" onClick={() => setDarkMode(!darkMode)} title="Modo oscuro">{darkMode ? '☀️' : '🌙'}</button>
          <button className="topbar-btn" onClick={() => { if (session) signOut(); else handleLogout(); }} style={{ marginLeft: '0.5rem' }}>🚪 Cerrar Sesión</button>
        </div>
      </div>

      <div className="main-layout">
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">Gestión</div>
            <div className={`sidebar-item ${activeTab === 'cartera' ? 'active' : ''}`} onClick={() => setActiveTab('cartera')}><span className="icon">📊</span> Cartera</div>
            <div className={`sidebar-item ${activeTab === 'credito' ? 'active' : ''}`} onClick={() => setActiveTab('credito')}><span className="icon">💳</span> Crédito</div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Descarga</div>
            <div className="sidebar-item" onClick={exportarTodosExcel}><span className="icon">📊</span> Excel - Todos</div>
            <div className="sidebar-item" onClick={exportarNoGeneraron}><span className="icon">📊</span> No Generaron</div>
            <div className="sidebar-item" onClick={exportarFacturados}><span className="icon">📊</span> Facturados</div>
            <div className="sidebar-item" onClick={exportarPDF}><span className="icon">📄</span> PDF - Cartera</div>
            <div className="sidebar-item" onClick={backupJSON}><span className="icon">💾</span> Backup JSON</div>
            <div className="sidebar-item" onClick={() => setShowImportModal(true)}><span className="icon">📥</span> Importar Excel</div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Mes</div>
            <div style={{ padding: '0 0.75rem' }}>
              <select value={mesVisualizando} onChange={(e) => setMesVisualizando(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.7rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#1e2d4a', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.5rem' }}>
                {obtenerMesesDisponibles().map(mes => <option key={mes} value={mes}>{obtenerNombreMes(mes)}{mes === obtenerMesActual() ? ' (Actual)' : ''}</option>)}
              </select>
              {!esModoPasado ? (
                <button onClick={() => setShowDescargaMesModal(true)} style={{ width: '100%', padding: '0.5rem', background: '#f97316', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>💾 Guardar Mes</button>
              ) : (
                <div style={{ padding: '0.4rem 0.7rem', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '7px', fontSize: '0.75rem', fontWeight: 600, color: '#f97316', textAlign: 'center' }}>🔒 Solo Lectura</div>
              )}
            </div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Sistema</div>
            <div className="sidebar-item" onClick={exportarDatos}><span className="icon">💾</span> Exportar JSON</div>
            <label className="sidebar-item" style={{ cursor: 'pointer' }}>
              <span className="icon">📂</span> Importar JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => { try { const datos = JSON.parse(ev.target.result); if (datos.clientes) setClientes(datos.clientes); if (datos.creditos) setCreditos(datos.creditos); showToast('Datos importados correctamente', 'success'); } catch { showToast('Error al importar el archivo', 'error'); } };
                reader.readAsText(file);
              }} />
            </label>
          </div>
        </div>

        {/* CONTENT */}
        <div className="content-area">
          <div className="page-header">
            <div>
              <h1>📊 Gestión de Cartera</h1>
              <p>Panel de control · CPEREZ · {new Date().toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <div className="estado-flow">
                <span className="flow-step">📋 Cotizado</span><span className="flow-arrow">→</span>
                <span className="flow-step">📧 Notificado</span><span className="flow-arrow">→</span>
                <span className="flow-step">💰 Pagado</span><span className="flow-arrow">→</span>
                <span className="flow-step">✅ Facturado</span><span className="flow-arrow">·</span>
                <span className="flow-step">🚫 No Generaron</span>
              </div>
              {esDespuesDel15 && estadisticas.vencido > 0 && <div className="alert-banner" style={{ marginTop: '0.75rem' }}>⚠️ ALERTA: {estadisticas.vencido} cliente(s) vencidos sin pago antes del día 15</div>}
            </div>
            <div className="fecha-corte">🗓️ Corte: Día 15 de cada mes</div>
          </div>

          <div className="tabs-nav">
            <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>🏠 Inicio</button>
            <button className={`tab-btn ${activeTab === 'cartera' ? 'active' : ''}`} onClick={() => setActiveTab('cartera')}>📊 Cartera</button>
            <button className={`tab-btn ${activeTab === 'credito' ? 'active' : ''}`} onClick={() => setActiveTab('credito')}>💳 Crédito</button>
            <button className={`tab-btn ${activeTab === 'calendario' ? 'active' : ''}`} onClick={() => setActiveTab('calendario')}>📅 Calendario</button>
          </div>

          {/* TAB DASHBOARD */}
          <div className={`tab-content ${activeTab === 'dashboard' ? 'active' : ''}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Total Clientes', value: clientes.length, icon: '👥', color: '#0284c7', bg: '#f0f9ff' },
                { label: 'Cobrado este mes', value: `$${(estadisticas.montoPagado||0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: '💰', color: '#059669', bg: '#ecfdf5' },
                { label: 'Clientes Vencidos', value: estadisticas.vencido, icon: '⚠️', color: '#dc2626', bg: '#fef2f2' },
                { label: 'Créditos Activos', value: creditoStats.activo + creditoStats.porVencer, icon: '💳', color: '#7c3aed', bg: '#f5f3ff' },
                { label: 'Por Cobrar', value: `$${(estadisticas.montoCotizado + estadisticas.montoNotificado||0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, icon: '📋', color: '#ea580c', bg: '#fff7ed' },
                { label: 'Créditos Vencidos', value: creditoStats.vencido, icon: '🚨', color: '#dc2626', bg: '#fef2f2' },
              ].map((s, i) => (
                <div key={i} style={{ background: s.bg, border: `1px solid ${s.color}33`, borderRadius: '14px', padding: '1.3rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '2rem' }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, fontFamily: 'var(--mono)' }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>⚠️ Créditos por Vencer (7 días)</div>
                {creditosAlerta.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No hay créditos próximos a vencer.</p> :
                  creditosAlerta.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div><strong>{c.cliente}</strong><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Orden: {c.numeroOrden}</div></div>
                    <span className={`dias-restantes ${getDiasRestantes(c.fechaVencimiento) <= 3 ? 'critico' : 'advertencia'}`}>{getDiasRestantes(c.fechaVencimiento)} días</span>
                  </div>)}
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>🕒 Últimos clientes agregados</div>
                {[...clientes].reverse().slice(0, 5).map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.nombre}</span>
                  <span className={`badge badge-${c.estado.toLowerCase().replace(/ /g,'-')}`}>{c.estado}</span>
                </div>)}
              </div>
            </div>
            {/* Aging Report */}
            {(() => {
              const hoy = new Date();
              const buckets = [
                { label: 'Al día', color: '#059669', bg: '#ecfdf5', clientes: [] },
                { label: '1–30 días', color: '#f59e0b', bg: '#fffbeb', clientes: [] },
                { label: '31–60 días', color: '#ea580c', bg: '#fff7ed', clientes: [] },
                { label: '61–90 días', color: '#dc2626', bg: '#fef2f2', clientes: [] },
                { label: '90+ días', color: '#7f1d1d', bg: '#fef2f2', clientes: [] },
              ];
              clientes.forEach(c => {
                if (!c.fechaCotizacion || c.estado === 'Pagado' || c.estado === 'Facturado') return;
                const dias = Math.ceil((hoy - new Date(c.fechaCotizacion)) / (1000 * 60 * 60 * 24));
                if (dias <= 0) buckets[0].clientes.push(c);
                else if (dias <= 30) buckets[1].clientes.push(c);
                else if (dias <= 60) buckets[2].clientes.push(c);
                else if (dias <= 90) buckets[3].clientes.push(c);
                else buckets[4].clientes.push(c);
              });
              const total = buckets.reduce((s, b) => s + b.clientes.length, 0);
              if (total === 0) return null;
              return (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>📊 Antigüedad de Cartera (Aging Report)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                    {buckets.map(b => (
                      <div key={b.label} style={{ background: b.bg, borderRadius: '10px', padding: '0.75rem', textAlign: 'center', border: `1px solid ${b.color}33` }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: b.color, textTransform: 'uppercase', marginBottom: '0.3rem' }}>{b.label}</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: b.color, fontFamily: 'var(--mono)' }}>{b.clientes.length}</div>
                        <div style={{ fontSize: '0.7rem', color: b.color, fontWeight: 600 }}>{total > 0 ? ((b.clientes.length / total) * 100).toFixed(0) : 0}%</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', height: '8px', borderRadius: '6px', overflow: 'hidden' }}>
                    {buckets.map(b => <div key={b.label} style={{ flex: b.clientes.length || 0.001, background: b.color, transition: 'flex 0.4s' }}></div>)}
                  </div>
                </div>
              );
            })()}

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>⚡ Accesos rápidos</div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => { setActiveTab('cartera'); abrirModal(); }}>+ Nuevo Cliente</button>
                <button className="btn btn-success" onClick={() => setActiveTab('credito')}>+ Nuevo Crédito</button>
                <button className="btn btn-secondary" onClick={backupJSON}>💾 Backup</button>
                <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>📥 Importar Excel</button>
                <button className="btn btn-secondary" onClick={exportarPDF}>📄 Exportar PDF</button>
                <button className="btn btn-secondary" onClick={() => setShowBusquedaGlobal(true)}>🔍 Buscar</button>
              </div>
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--surface2)', borderRadius: '9px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <strong>Atajos de teclado:</strong> &nbsp;
                <kbd style={{ background: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border2)', marginRight: '0.5rem' }}>N</kbd> Nuevo cliente &nbsp;
                <kbd style={{ background: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border2)', marginRight: '0.5rem' }}>F</kbd> Buscar &nbsp;
                <kbd style={{ background: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border2)', marginRight: '0.5rem' }}>C</kbd> Cartera &nbsp;
                <kbd style={{ background: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border2)', marginRight: '0.5rem' }}>R</kbd> Crédito &nbsp;
                <kbd style={{ background: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border2)' }}>D</kbd> Modo oscuro
              </div>
            </div>
          </div>

          {/* TAB CALENDARIO */}
          <div className={`tab-content ${activeTab === 'calendario' ? 'active' : ''}`}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--navy)', marginBottom: '1.25rem' }}>📅 Vencimientos de Créditos</div>
              {(() => {
                const hoy = new Date();
                const año = hoy.getFullYear();
                const mes = hoy.getMonth();
                const primerDia = new Date(año, mes, 1).getDay();
                const diasEnMes = new Date(año, mes + 1, 0).getDate();
                const nombresMeses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
                const vencimientosPorDia = {};
                creditos.forEach(c => {
                  if (c.estado === 'Pagado') return;
                  const fv = new Date(c.fechaVencimiento);
                  if (fv.getFullYear() === año && fv.getMonth() === mes) {
                    const d = fv.getDate();
                    if (!vencimientosPorDia[d]) vencimientosPorDia[d] = [];
                    vencimientosPorDia[d].push(c);
                  }
                });
                const celdas = [];
                for (let i = 0; i < primerDia; i++) celdas.push(null);
                for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
                return (
                  <div>
                    <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', color: 'var(--navy)', marginBottom: '1rem' }}>{nombresMeses[mes]} {año}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem', marginBottom: '0.5rem' }}>
                      {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', padding: '0.3rem' }}>{d}</div>)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem' }}>
                      {celdas.map((dia, i) => {
                        const esHoy = dia === hoy.getDate();
                        const tieneVenc = dia && vencimientosPorDia[dia];
                        return <div key={i} style={{ minHeight: '60px', borderRadius: '8px', padding: '0.4rem', background: esHoy ? 'var(--accent)' : tieneVenc ? '#fef2f2' : 'var(--surface2)', border: `1px solid ${esHoy ? 'var(--accent)' : tieneVenc ? '#fecaca' : 'var(--border)'}`, position: 'relative' }}>
                          {dia && <div style={{ fontWeight: esHoy ? 800 : 600, fontSize: '0.85rem', color: esHoy ? 'white' : 'var(--text)' }}>{dia}</div>}
                          {tieneVenc && tieneVenc.map((c, j) => <div key={j} style={{ fontSize: '0.65rem', background: '#ef4444', color: 'white', borderRadius: '4px', padding: '0.1rem 0.3rem', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.cliente}>{c.cliente}</div>)}
                        </div>;
                      })}
                    </div>
                    {Object.keys(vencimientosPorDia).length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '1.5rem' }}>No hay créditos que venzan este mes.</p>}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* TAB CARTERA */}
          <div className={`tab-content ${activeTab === 'cartera' ? 'active' : ''}`}>
            <div className="dashboard">
              {[
                { key: 'cotizado', label: '📋 Cotizado', val: estadisticas.cotizado, pct: estadisticas.cotizadoPct, monto: estadisticas.montoCotizado, color: '#ea580c' },
                { key: 'notificado', label: '📧 Notificado', val: estadisticas.notificado, pct: estadisticas.notificadoPct, monto: estadisticas.montoNotificado, color: '#0284c7' },
                { key: 'pagado', label: '💰 Pagado', val: estadisticas.pagado, pct: estadisticas.pagadoPct, monto: estadisticas.montoPagado, color: '#059669' },
                { key: 'facturado', label: '✅ Facturado', val: estadisticas.facturado, pct: estadisticas.facturadoPct, monto: estadisticas.montoFacturado, color: '#16a34a' },
                { key: 'vencido', label: '❌ Vencido', val: estadisticas.vencido, pct: estadisticas.vencidoPct, monto: estadisticas.montoVencido, color: '#dc2626' },
                { key: 'no-generaron', label: '🚫 No Generaron', val: estadisticas.noGeneraron, pct: estadisticas.noGeneraronPct, monto: null, color: '#64748b' },
                { key: 'suspendido', label: '⏸️ Suspendidos', val: estadisticas.suspendido, pct: estadisticas.suspendidoPct, monto: estadisticas.montoSuspendido, color: '#dc2626' },
              ].map(s => (
                <div key={s.key} className={`stat-card ${s.key}`}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.val}</div>
                  <div className="stat-percentage">{s.pct}%{s.monto != null && fmtMonto(s.monto, s.val) && <span style={{ display: 'block', color: s.color, fontWeight: 800, fontSize: '0.85rem' }}>{fmtMonto(s.monto, s.val)}</span>}</div>
                </div>
              ))}
            </div>

            {/* GRÁFICAS CARTERA */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distribución por Estado</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={[
                      { name: 'Cotizado', value: estadisticas.cotizado },
                      { name: 'Notificado', value: estadisticas.notificado },
                      { name: 'Pagado', value: estadisticas.pagado },
                      { name: 'Facturado', value: estadisticas.facturado },
                      { name: 'Vencido', value: estadisticas.vencido },
                      { name: 'No Generaron', value: estadisticas.noGeneraron },
                    ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} fontSize={11}>
                      {['#f97316','#0ea5e9','#10b981','#22c55e','#ef4444','#94a3b8'].map((color, i) => <Cell key={i} fill={color} />)}
                    </Pie>
                    <Tooltip formatter={(v, name) => [v, name]} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: '0.75rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Montos por Estado ($)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={[
                    { estado: 'Cotizado', monto: estadisticas.montoCotizado || 0 },
                    { estado: 'Notificado', monto: estadisticas.montoNotificado || 0 },
                    { estado: 'Pagado', monto: estadisticas.montoPagado || 0 },
                    { estado: 'Vencido', monto: estadisticas.montoVencido || 0 },
                  ].filter(d => d.monto > 0)} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <XAxis dataKey="estado" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => [`$${v.toLocaleString('en-US')}`, 'Monto']} />
                    <Bar dataKey="monto" radius={[6,6,0,0]}>
                      {['#f97316','#0ea5e9','#10b981','#ef4444'].map((color, i) => <Cell key={i} fill={color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="controls">
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input type="text" placeholder="Buscar por nombre, ID o contacto... (F)" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPaginaActual(1); }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Desde:</span>
                <input type="date" value={fechaDesde} onChange={e => { setFechaDesde(e.target.value); setPaginaActual(1); }} style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--border2)', borderRadius: '8px', fontSize: '0.82rem', background: 'var(--surface)', color: 'var(--text)' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Hasta:</span>
                <input type="date" value={fechaHasta} onChange={e => { setFechaHasta(e.target.value); setPaginaActual(1); }} style={{ padding: '0.45rem 0.6rem', border: '1px solid var(--border2)', borderRadius: '8px', fontSize: '0.82rem', background: 'var(--surface)', color: 'var(--text)' }} />
                {(fechaDesde || fechaHasta) && <button onClick={() => { setFechaDesde(''); setFechaHasta(''); }} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid var(--danger)', background: '#fef2f2', color: 'var(--danger)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>✕ Limpiar</button>}
              </div>
              <div className="filter-buttons">
                {['todos', 'cotizado', 'notificado', 'pagado', 'facturado', 'vencido', 'no-generaron'].map(f => (
                  <button key={f} className={`btn btn-filter ${filter === f ? 'active' : ''}`} onClick={() => { setFilter(f); setPaginaActual(1); }}>{f === 'todos' ? 'Todos' : f === 'no-generaron' ? 'No Generaron' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button className="btn btn-secondary" onClick={() => { setVistaCards(false); setVistaKanban(false); }} style={{ background: !vistaCards && !vistaKanban ? 'var(--navy)' : '', color: !vistaCards && !vistaKanban ? 'white' : '' }} title="Tabla">📋</button>
                <button className="btn btn-secondary" onClick={() => { setVistaCards(true); setVistaKanban(false); }} style={{ background: vistaCards ? 'var(--navy)' : '', color: vistaCards ? 'white' : '' }} title="Tarjetas">🃏</button>
                <button className="btn btn-secondary" onClick={() => { setVistaKanban(true); setVistaCards(false); }} style={{ background: vistaKanban ? 'var(--navy)' : '', color: vistaKanban ? 'white' : '' }} title="Kanban">📌 Kanban</button>
              </div>
              <button className="btn btn-primary" onClick={() => !esModoPasado && abrirModal()} disabled={esModoPasado} style={{ opacity: esModoPasado ? 0.5 : 1 }}>+ Nuevo Cliente</button>
            </div>

            <div className="sort-controls">
              <strong style={{ color: 'var(--text)', alignSelf: 'center' }}>Ordenar por:</strong>
              {['prioridad', 'id', 'nombre', 'monto'].map(campo => (
                <button key={campo} className={`btn-sort ${ordenarPor === campo ? 'active' : ''} ${ordenarPor === campo ? direccionOrden : ''}`} onClick={() => cambiarOrdenamiento(campo)}>{campo.charAt(0).toUpperCase() + campo.slice(1)}</button>
              ))}
            </div>

            {vistaCards && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {clientesPaginados.map(cliente => {
                  const s = calcularSaldoCliente(cliente);
                  return (
                    <div key={cliente.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'all 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                      onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <span className="nombre-cliente" onClick={() => { setHistorialPagosCliente(cliente); setShowHistorialPagosModal(true); }} style={{ fontSize: '1rem' }}>{cliente.nombre}</span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>ID: {cliente.id} · {cliente.mes}/{cliente.año}</div>
                        </div>
                        <span className={`badge badge-${cliente.estado.toLowerCase().replace(/ /g, '-')}`}>{cliente.estado}</span>
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent2)', marginBottom: '0.5rem' }}>${(parseFloat(cliente.monto) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                      {s.pagado > 0 && <div style={{ fontSize: '0.75rem', color: '#059669' }}>✓ Pagado: ${s.pagado.toLocaleString('en-US', { maximumFractionDigits: 0 })} · Pend: ${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
                        {cliente.contacto && <a href={`https://wa.me/1${cliente.contacto.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="accion-btn" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a' }}>🟢</a>}
                        <button className="accion-btn edit" onClick={() => !esModoPasado && abrirModal(cliente)}>✏️</button>
                        <button className="accion-btn delete" onClick={() => !esModoPasado && eliminarCliente(cliente.id)}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {vistaKanban && (
              <div className="kanban-board">
                {[
                  { estado: 'Cotizado', color: '#ea580c', emoji: '📋' },
                  { estado: 'Notificado', color: '#0284c7', emoji: '📧' },
                  { estado: 'Pagado', color: '#059669', emoji: '💰' },
                  { estado: 'Facturado', color: '#16a34a', emoji: '✅' },
                  { estado: 'Vencido', color: '#dc2626', emoji: '❌' },
                  { estado: 'No Generaron', color: '#64748b', emoji: '🚫' },
                ].map(({ estado, color, emoji }) => {
                  const cols = clientesFiltrados.filter(c => c.estado === estado);
                  return (
                    <div key={estado} className="kanban-col">
                      <div className="kanban-col-header" style={{ borderTop: `3px solid ${color}` }}>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color }}>{emoji} {estado}</span>
                        <span style={{ background: color + '22', color, fontWeight: 800, fontSize: '0.75rem', padding: '0.15rem 0.55rem', borderRadius: '20px' }}>{cols.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem 0.6rem', minHeight: '80px' }}>
                        {cols.map(cliente => {
                          const s = calcularSaldoCliente(cliente);
                          const pct = s.monto > 0 ? Math.min((s.pagado / s.monto) * 100, 100) : 0;
                          return (
                            <div key={cliente.id} className="kanban-card">
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer', marginBottom: '0.25rem' }}
                                onClick={() => { setHistorialPagosCliente(cliente); setShowHistorialPagosModal(true); }}>
                                {cliente.nombre}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>#{cliente.id} · {cliente.mes}/{cliente.año}</div>
                              {s.monto > 0 && <div style={{ fontWeight: 800, fontFamily: 'var(--mono)', fontSize: '0.9rem', color: 'var(--accent2)', marginBottom: '0.35rem' }}>${s.monto.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>}
                              {s.monto > 0 && (
                                <div className="progress-bar-wrap" style={{ marginBottom: '0.4rem' }}>
                                  <div className="progress-bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? '#059669' : color }}></div>
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.3rem', marginTop: '0.2rem' }}>
                                {cliente.contacto && <button onClick={() => abrirWhatsappModal(cliente)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem' }} title="WhatsApp">🟢</button>}
                                <button onClick={() => !esModoPasado && abrirModal(cliente)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem' }} title="Editar">✏️</button>
                              </div>
                            </div>
                          );
                        })}
                        {cols.length === 0 && <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', borderRadius: '10px', border: '1.5px dashed var(--border)' }}>Sin clientes</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="table-container" style={{ display: vistaCards || vistaKanban ? 'none' : 'block' }}>
              <div className="table-wrapper">
                {clientesFiltrados.length === 0 ? (
                  <div className="empty-state"><h3>No se encontraron clientes</h3><p>Intenta ajustar los filtros o agregar un nuevo cliente</p></div>
                ) : (
                  <table>
                    <thead><tr><th>ID</th><th>Cliente</th><th>Contacto</th><th>Estado Actual</th><th>Mes/Año</th><th>Monto</th><th>Fecha Cotización</th><th>Proceso</th><th>Suspensión</th><th>Opciones</th></tr></thead>
                    <tbody>
                      {clientesPaginados.map(cliente => {
                        const estaSuspendido = cliente.suspendido === true;
                        return (
                          <tr key={cliente.id} className={estaSuspendido ? 'cliente-suspendido' : ''}>
                            <td><div className="id-with-led"><span className={`status-led ${estaSuspendido ? 'suspended' : esClienteActivo(cliente) ? 'active' : 'inactive'}`}></span><strong>{cliente.id}</strong></div></td>
                            <td><span onClick={() => { setHistorialPagosCliente(cliente); setShowHistorialPagosModal(true); }} className="nombre-cliente" title="Ver historial de pagos">{cliente.nombre}</span></td>
                            <td>{cliente.contacto ? (
                              <span onClick={() => abrirWhatsappModal(cliente)} style={{ color: '#16a34a', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
                                📱 {cliente.contacto}
                              </span>
                            ) : '-'}</td>
                            <td><span className={`badge badge-${cliente.estado.toLowerCase().replace(/ /g, '-')}`}>{cliente.estado}</span></td>
                            <td><span className="fecha-badge">{cliente.mes}/{cliente.año}</span></td>
                            <td>
                              {editingMontoId === cliente.id ? (
                                <input type="number" value={tempMonto} onChange={(e) => setTempMonto(e.target.value)} onBlur={() => guardarMontoInline(cliente.id)} onKeyDown={(e) => { if (e.key === 'Enter') guardarMontoInline(cliente.id); else if (e.key === 'Escape') cancelarEdicionMonto(); }} autoFocus step="0.01" style={{ width: '100%', padding: '0.5rem', border: '2px solid #0ea5e9', borderRadius: '6px', fontSize: '1rem', fontWeight: 700 }} />
                              ) : (
                                <div>
                                  <strong onClick={() => !esModoPasado && iniciarEdicionMonto(cliente)} style={{ cursor: esModoPasado ? 'default' : 'pointer', padding: '0.4rem 0.5rem', borderRadius: '6px', display: 'inline-block' }} title={esModoPasado ? 'Solo lectura' : 'Click para editar monto'}>
                                    {'$' + (parseFloat(cliente.monto) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                  </strong>
                                  {cliente.pagosRealizados && cliente.pagosRealizados.length > 0 && (() => { const s = calcularSaldoCliente(cliente); return <div style={{ fontSize: '0.7rem', marginTop: '0.1rem' }}><span style={{ color: '#059669', fontWeight: 700 }}>pagado: ${s.pagado.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>{s.pendiente > 0 && <span style={{ color: '#ea580c', fontWeight: 700 }}> · pend: ${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>}</div>; })()}
                                </div>
                              )}
                            </td>
                            <td>{cliente.fechaCotizacion ? new Date(cliente.fechaCotizacion).toLocaleDateString('es-DO') : '-'}</td>
                            <td>
                              <div className="proceso-icons">
                                <button className={`proceso-icon cotizado ${cliente.fechaCotizacion ? 'done' : ''}`} disabled={esModoPasado} title={cliente.fechaCotizacion ? 'Cotizado' : 'Marcar Cotizado'} onClick={() => { if (esModoPasado) return; const a = { ...cliente }; if (!a.fechaCotizacion) { a.fechaCotizacion = new Date().toISOString().split('T')[0]; if (!a.estado || a.estado === 'No Generaron') a.estado = 'Cotizado'; } else { a.fechaCotizacion = ''; a.fechaNotificacion = ''; a.fechaPago = ''; a.fechaFacturacion = ''; a.pagosRealizados = []; a.estado = 'No Generaron'; } a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.fechaCotizacion ? 'Marco Cotizado' : 'Desmarco Cotizado', usuario: 'CPEREZ' }]; setClientes(clientes.map(c => c.id === cliente.id ? a : c)); }}>📋</button>
                                <button className={`proceso-icon notificado ${cliente.fechaNotificacion ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaCotizacion} style={{ opacity: !cliente.fechaCotizacion ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaCotizacion) return; const a = { ...cliente }; if (!a.fechaNotificacion) { a.fechaNotificacion = new Date().toISOString().split('T')[0]; a.estado = 'Notificado'; } else { a.fechaNotificacion = ''; a.fechaPago = ''; a.fechaFacturacion = ''; a.pagosRealizados = []; a.estado = 'Cotizado'; } a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.fechaNotificacion ? 'Marco Notificado' : 'Desmarco Notificado', usuario: 'CPEREZ' }]; setClientes(clientes.map(c => c.id === cliente.id ? a : c)); }}>📧</button>
                                <button className={`proceso-icon pagado ${cliente.fechaPago ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaNotificacion} style={{ opacity: !cliente.fechaNotificacion ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaNotificacion) return; const a = { ...cliente }; if (!a.fechaPago) { if (a.monto && parseFloat(a.monto) > 0) { abrirPagoModal(a); return; } a.fechaPago = new Date().toISOString().split('T')[0]; a.estado = 'Pagado'; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: 'Marco Pagado', usuario: 'CPEREZ' }]; setClientes(clientes.map(c => c.id === cliente.id ? a : c)); return; } a.fechaPago = ''; a.fechaFacturacion = ''; a.pagosRealizados = []; a.estado = 'Notificado'; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: 'Desmarco Pagado', usuario: 'CPEREZ' }]; setClientes(clientes.map(c => c.id === cliente.id ? a : c)); }}>💰</button>
                                <button className={`proceso-icon facturado ${cliente.fechaFacturacion ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaPago} style={{ opacity: !cliente.fechaPago ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaPago) return; const a = { ...cliente }; if (!a.fechaFacturacion) { a.fechaFacturacion = new Date().toISOString().split('T')[0]; a.estado = 'Facturado'; } else { a.fechaFacturacion = ''; a.estado = 'Pagado'; } a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.fechaFacturacion ? 'Marco Facturado' : 'Desmarco Facturado', usuario: 'CPEREZ' }]; setClientes(clientes.map(c => c.id === cliente.id ? a : c)); }}>💲</button>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {(cliente.estado === 'Pagado' || cliente.estado === 'Facturado') ? <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span> : (
                                <button disabled={esModoPasado} onClick={() => { if (esModoPasado) return; const a = { ...cliente }; a.suspendido = !a.suspendido; a.fechaSuspension = a.suspendido ? new Date().toISOString().split('T')[0] : ''; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.suspendido ? 'Cliente SUSPENDIDO' : 'Suspensión removida', usuario: 'CPEREZ' }]; setClientes(clientes.map(c => c.id === cliente.id ? a : c)); }} style={{ padding: '0.3rem 0.65rem', borderRadius: '7px', border: cliente.suspendido ? '1px solid #dc2626' : '1px solid #cbd5e1', background: cliente.suspendido ? '#ef4444' : 'white', color: cliente.suspendido ? 'white' : '#64748b', fontWeight: 700, fontSize: '0.75rem', cursor: esModoPasado ? 'not-allowed' : 'pointer', opacity: esModoPasado ? 0.4 : 1 }}>
                                  {cliente.suspendido ? '🔴 Activo' : '⏸️ Suspender'}
                                </button>
                              )}
                            </td>
                            <td>
                              <div className="accion-icons">
                                {cliente.contacto && <button onClick={() => abrirWhatsappModal(cliente)} className="accion-btn" title="WhatsApp" style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a' }}>🟢</button>}
                                <button className="accion-btn edit" disabled={esModoPasado} title="Editar" onClick={() => !esModoPasado && abrirModal(cliente)}>✏️</button>
                                <button className={`accion-btn nota ${cliente.nota ? 'has-note' : ''}`} title={cliente.nota ? 'Ver nota' : 'Agregar nota'} onClick={() => abrirNotaModal(cliente)}>💬</button>
                                <button className="accion-btn delete" disabled={esModoPasado} title="Eliminar" onClick={() => !esModoPasado && eliminarCliente(cliente.id)}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {totalPaginas > 1 && (
                <div className="pagination-bar">
                  <button className="page-btn nav" disabled={paginaActual === 1} onClick={() => setPaginaActual(p => p - 1)}>← Anterior</button>
                  {getPaginasAMostrar().map((pagina, i) => pagina === '...' ? <span key={`e${i}`} className="page-ellipsis">...</span> : <button key={pagina} className={`page-btn ${paginaActual === pagina ? 'active' : ''}`} onClick={() => setPaginaActual(pagina)}>{pagina}</button>)}
                  <button className="page-btn nav" disabled={paginaActual === totalPaginas} onClick={() => setPaginaActual(p => p + 1)}>Próxima →</button>
                </div>
              )}
            </div>
          </div>

          {/* TAB CRÉDITO */}
          <div className={`tab-content ${activeTab === 'credito' ? 'active' : ''}`}>
            {creditosVencidos.length > 0 && <div className="alert-box danger"><h3>⚠️ Créditos Vencidos ({creditosVencidos.length})</h3>{creditosVencidos.map(credito => <div key={credito.id} className="alert-item"><div><strong>{credito.cliente}</strong> - Orden: {credito.numeroOrden}<div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Vencido: {new Date(credito.fechaVencimiento).toLocaleDateString('es-DO')}</div></div><span className="dias-restantes critico">{Math.abs(getDiasRestantes(credito.fechaVencimiento))} días vencido</span></div>)}</div>}
            {creditosAlerta.length > 0 && <div className="alert-box"><h3>⏰ Créditos por Vencer ({creditosAlerta.length})</h3>{creditosAlerta.map(credito => { const dias = getDiasRestantes(credito.fechaVencimiento); return <div key={credito.id} className="alert-item"><div><strong>{credito.cliente}</strong> - Orden: {credito.numeroOrden}<div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Vence: {new Date(credito.fechaVencimiento).toLocaleDateString('es-DO')}</div></div><span className={`dias-restantes ${dias <= 3 ? 'critico' : 'advertencia'}`}>{dias} {dias === 1 ? 'día' : 'días'}</span></div>; })}</div>}

            <div className="dashboard">
              <div className="stat-card activo"><div className="stat-label">Activos</div><div className="stat-value">{creditoStats.activo}</div><div className="stat-percentage">{creditoStats.activoPct}%</div></div>
              <div className="stat-card por-vencer"><div className="stat-label">Por Vencer</div><div className="stat-value">{creditoStats.porVencer}</div><div className="stat-percentage">{creditoStats.porVencerPct}%</div></div>
              <div className="stat-card credito-vencido"><div className="stat-label">Vencidos</div><div className="stat-value">{creditoStats.vencido}</div><div className="stat-percentage">{creditoStats.vencidoPct}%</div></div>
              <div className="stat-card credito-pagado"><div className="stat-label">Pagados</div><div className="stat-value">{creditoStats.pagado}</div><div className="stat-percentage">{creditoStats.pagadoPct}%</div></div>
              <div className="stat-card activo"><div className="stat-label">Monto Total Activo</div><div className="stat-value" style={{ fontSize: '1.8rem' }}>${creditoStats.totalMonto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
              <div className="stat-card credito-pagado"><div className="stat-label">Monto Total Pagado</div><div className="stat-value" style={{ fontSize: '1.8rem' }}>${creditoStats.montoPagado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
            </div>

            <div className="controls">
              <div className="search-box"><span className="search-icon">🔍</span><input type="text" placeholder="Buscar crédito..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
              <button className="btn btn-success" onClick={exportarCreditosExcel}>📊 Exportar a Excel</button>
              <button className="btn btn-secondary" onClick={exportarCreditosPDF}>📄 Exportar PDF</button>
              <button className="btn btn-primary" onClick={() => abrirCreditoModal()}>➕ Nuevo Crédito</button>
            </div>

            <div className="table-container">
              {creditos.length === 0 ? <div className="empty-state"><p>No hay créditos registrados</p></div> : (
                <table>
                  <thead><tr><th>ID</th><th>Nº Orden</th><th>Cliente</th><th>Monto</th><th>Saldo Pend.</th><th>Proceso</th><th>Fecha Inicio</th><th>Plazo</th><th>Vencimiento</th><th>Días Restantes</th><th>Estado</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {creditos.filter(c => c.cliente.toLowerCase().includes(searchTerm.toLowerCase()) || c.numeroOrden.toLowerCase().includes(searchTerm.toLowerCase()) || c.id.toString().includes(searchTerm)).map(credito => {
                      const diasRestantes = getDiasRestantes(credito.fechaVencimiento);
                      return (
                        <tr key={credito.id}>
                          <td><strong>{credito.id}</strong></td>
                          <td><strong>{credito.numeroOrden}</strong></td>
                          <td>{credito.cliente}</td>
                          <td>
                            {editingCreditoMontoId === credito.id ? (
                              <input type="number" value={tempCreditoMonto} onChange={(e) => setTempCreditoMonto(e.target.value)} onBlur={() => guardarCreditoMontoInline(credito.id)} onKeyDown={(e) => { if (e.key === 'Enter') guardarCreditoMontoInline(credito.id); else if (e.key === 'Escape') cancelarEdicionCreditoMonto(); }} autoFocus step="0.01" style={{ width: '100%', padding: '0.5rem', border: '2px solid #0ea5e9', borderRadius: '6px', fontWeight: 700 }} />
                            ) : (
                              <span onClick={() => iniciarEdicionCreditoMonto(credito)} style={{ cursor: 'pointer', padding: '0.5rem', borderRadius: '6px', display: 'inline-block', fontWeight: 700 }} title="Click para editar">${parseFloat(credito.monto || 0).toLocaleString()}</span>
                            )}
                          </td>
                          <td>{(() => { const s = calcularSaldosCredito(credito.monto, credito.abonos || []); const pct = s.total > 0 ? Math.min((s.abonado / s.total) * 100, 100) : 0; return <div style={{ minWidth: '110px' }}><div style={{ fontWeight: 700, color: s.pendiente > 0 ? '#f59e0b' : '#059669', marginBottom: '0.25rem' }}>${s.pendiente.toFixed(2)}</div>{s.total > 0 && <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? '#059669' : '#635bff' }}></div></div>}{s.abonado > 0 && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{pct.toFixed(0)}% pagado</div>}</div>; })()}</td>
                          <td>
                            <div className="proceso-icons">
                              <button className={`proceso-icon cotizado ${credito.fechaCotizacion ? 'done' : ''}`} onClick={() => { const a = { ...credito }; if (!a.fechaCotizacion) a.fechaCotizacion = new Date().toISOString().split('T')[0]; else { a.fechaCotizacion = ''; a.fechaNotificacionC = ''; a.fechaPagoC = ''; a.fechaFacturacionC = ''; } setCreditos(creditos.map(c => c.id === credito.id ? a : c)); }}>📋</button>
                              <button className={`proceso-icon notificado ${credito.fechaNotificacionC ? 'done' : ''}`} disabled={!credito.fechaCotizacion} style={{ opacity: !credito.fechaCotizacion ? 0.3 : 1 }} onClick={() => { if (!credito.fechaCotizacion) return; const a = { ...credito }; if (!a.fechaNotificacionC) a.fechaNotificacionC = new Date().toISOString().split('T')[0]; else { a.fechaNotificacionC = ''; a.fechaPagoC = ''; a.fechaFacturacionC = ''; } setCreditos(creditos.map(c => c.id === credito.id ? a : c)); }}>📧</button>
                              <button className={`proceso-icon pagado ${credito.fechaPagoC ? 'done' : ''}`} disabled={!credito.fechaNotificacionC} style={{ opacity: !credito.fechaNotificacionC ? 0.3 : 1 }} onClick={() => { if (!credito.fechaNotificacionC) return; if (!credito.fechaPagoC) { abrirPagoCreditoModal(credito); return; } const a = { ...credito }; a.fechaPagoC = ''; a.fechaFacturacionC = ''; a.abonos = []; a.estado = 'Activo'; setCreditos(creditos.map(c => c.id === credito.id ? a : c)); }}>💰</button>
                              <button className={`proceso-icon facturado ${credito.fechaFacturacionC ? 'done' : ''}`} disabled={!credito.fechaPagoC} style={{ opacity: !credito.fechaPagoC ? 0.3 : 1 }} onClick={() => { if (!credito.fechaPagoC) return; const a = { ...credito }; if (!a.fechaFacturacionC) a.fechaFacturacionC = new Date().toISOString().split('T')[0]; else a.fechaFacturacionC = ''; setCreditos(creditos.map(c => c.id === credito.id ? a : c)); }}>💲</button>
                            </div>
                          </td>
                          <td>{new Date(credito.fechaInicio).toLocaleDateString('es-DO')}</td>
                          <td>{credito.plazoMeses} {credito.plazoMeses === '1' ? 'mes' : 'meses'}</td>
                          <td>{new Date(credito.fechaVencimiento).toLocaleDateString('es-DO')}</td>
                          <td>{credito.estado !== 'Pagado' && <span className={`dias-restantes ${diasRestantes < 0 ? 'critico' : diasRestantes <= 3 ? 'critico' : diasRestantes <= 7 ? 'advertencia' : ''}`}>{diasRestantes < 0 ? `${Math.abs(diasRestantes)} días vencido` : `${diasRestantes} días`}</span>}</td>
                          <td><span className={`badge badge-${credito.estado.toLowerCase().replace(/ /g, '-')}`}>{credito.estado}</span></td>
                          <td>
                            <div className="action-btns">
                              {credito.estado !== 'Pagado' && <button className="btn-icon" onClick={() => { const a = { ...credito, estado: 'Pagado', historial: [...(credito.historial || []), { fecha: new Date().toISOString(), accion: 'Marcado como Pagado' }] }; setCreditos(creditos.map(c => c.id === credito.id ? a : c)); }} title="Marcar Pagado">✅</button>}
                              <button className="btn-icon" onClick={() => abrirCreditoModal(credito)} title="Editar">✏️</button>
                              <button className="btn-icon" onClick={() => eliminarCredito(credito.id)} title="Eliminar">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* MODALES */}
          {/* Modal Cliente */}
          <div className={`modal ${showModal ? 'show' : ''}`}>
            <div className="modal-content">
              <div className="modal-header"><h2>{editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}</h2><button className="close-btn" onClick={cerrarModal}>×</button></div>
              <form onSubmit={guardarCliente}>
                <div className="form-group"><label>ID del Cliente *</label><input type="number" value={formData.id || ''} onChange={(e) => setFormData({ ...formData, id: parseInt(e.target.value) || '' })} required placeholder="Ej: 1234" /></div>
                <div className="form-group"><label>Nombre del Cliente *</label><input type="text" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required /></div>
                <div className="form-group"><label>Contacto (Teléfono)</label><input type="text" value={formData.contacto} onChange={(e) => setFormData({ ...formData, contacto: e.target.value })} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group"><label>Mes *</label><select value={formData.mes} onChange={(e) => setFormData({ ...formData, mes: e.target.value })} required><option value="">Seleccionar...</option>{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                  <div className="form-group"><label>Año *</label><input type="number" value={formData.año} onChange={(e) => setFormData({ ...formData, año: e.target.value })} min="2024" max="2030" required /></div>
                </div>
                <div className="form-group"><label>Monto</label><input type="number" value={formData.monto} onChange={(e) => setFormData({ ...formData, monto: e.target.value })} step="0.01" placeholder="Ej: 5000" /></div>
                <div className="form-group"><label>Estado *</label><select value={formData.estado} onChange={(e) => setFormData({ ...formData, estado: e.target.value })} required>{['Cotizado','Notificado','Pagado','Facturado','Vencido','Suspendido','No Generaron'].map(e => <option key={e} value={e}>{e}</option>)}</select></div>
                <div className="form-group"><label>Fecha de Cotización</label><input type="date" value={formData.fechaCotizacion} onChange={(e) => setFormData({ ...formData, fechaCotizacion: e.target.value })} /></div>
                <div className="form-group"><label>Comentario</label><textarea value={formData.comentario} onChange={(e) => setFormData({ ...formData, comentario: e.target.value })} /></div>
                {editingCliente && formData.historial && formData.historial.length > 0 && <div className="historial"><strong>Historial:</strong>{formData.historial.slice(-5).reverse().map((h, idx) => <div key={idx} className="historial-item">{new Date(h.fecha).toLocaleString('es-DO')} - {h.accion}</div>)}</div>}
                <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={cerrarModal}>Cancelar</button><button type="submit" className="btn btn-primary">{editingCliente ? 'Actualizar' : 'Guardar'}</button></div>
              </form>
            </div>
          </div>

          {/* Modal Crédito */}
          <div className={`modal ${showCreditoModal ? 'show' : ''}`}>
            <div className="modal-content">
              <div className="modal-header"><h2>{editingCredito ? 'Editar Crédito' : 'Nuevo Crédito'}</h2><button className="close-btn" onClick={cerrarCreditoModal}>×</button></div>
              <form onSubmit={guardarCredito}>
                <div className="form-group"><label>Número de Orden *</label><input type="text" value={creditoFormData.numeroOrden} onChange={(e) => setCreditoFormData({ ...creditoFormData, numeroOrden: e.target.value })} placeholder="Ej: ORD-2025-001" required /></div>
                <div className="form-group autocomplete-container">
                  <label>Cliente *</label>
                  <input type="text" value={creditoFormData.cliente} onChange={(e) => manejarCambioCliente(e.target.value)} onKeyDown={manejarTecladoAutocomplete} placeholder="Escribe el nombre del cliente..." autoComplete="off" required />
                  <small style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>💡 Escribe para ver sugerencias</small>
                  {mostrarAutocomplete && clientesFiltradosAuto.length > 0 && <div className="autocomplete-dropdown">{clientesFiltradosAuto.map((cliente, index) => <div key={cliente.id} className={`autocomplete-item ${index === selectedAutoIndex ? 'selected' : ''}`} onClick={() => seleccionarClienteAutocomplete(cliente)} onMouseEnter={() => setSelectedAutoIndex(index)}><span className="cliente-nombre">{cliente.nombre}</span><span className="cliente-id">ID: {cliente.id}</span></div>)}</div>}
                </div>
                <div className="form-group"><label>Monto del Crédito *</label><input type="number" value={creditoFormData.monto} onChange={(e) => setCreditoFormData({ ...creditoFormData, monto: e.target.value })} step="0.01" required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group"><label>Fecha de Inicio *</label><input type="date" value={creditoFormData.fechaInicio} onChange={(e) => { const nd = { ...creditoFormData, fechaInicio: e.target.value }; if (nd.fechaVencimiento) { const i = new Date(e.target.value); const f = new Date(nd.fechaVencimiento); nd.plazoMeses = Math.max(1, ((f.getFullYear() - i.getFullYear()) * 12) + (f.getMonth() - i.getMonth())).toString(); } setCreditoFormData(nd); }} required /></div>
                  <div className="form-group"><label>Fecha de Vencimiento *</label><input type="date" value={creditoFormData.fechaVencimiento} onChange={(e) => { const nd = { ...creditoFormData, fechaVencimiento: e.target.value }; if (nd.fechaInicio) { const i = new Date(nd.fechaInicio); const f = new Date(e.target.value); nd.plazoMeses = Math.max(1, ((f.getFullYear() - i.getFullYear()) * 12) + (f.getMonth() - i.getMonth())).toString(); } setCreditoFormData(nd); }} required /></div>
                </div>
                {creditoFormData.fechaInicio && creditoFormData.fechaVencimiento && <div style={{ padding: '0.9rem', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.88rem', fontWeight: 600, color: '#64748b' }}>⏱ Plazo calculado: <span style={{ color: '#0ea5e9', fontWeight: 800, fontSize: '1.1rem' }}>{creditoFormData.plazoMeses || '0'} {creditoFormData.plazoMeses === '1' ? 'mes' : 'meses'}</span></div>}
                <div className="form-group"><label>Estado *</label><select value={creditoFormData.estado} onChange={(e) => setCreditoFormData({ ...creditoFormData, estado: e.target.value })} required>{['Activo','Por Vencer','Vencido','Pagado'].map(e => <option key={e} value={e}>{e}</option>)}</select></div>
                <div className="form-group"><label>Comentario</label><textarea value={creditoFormData.comentario} onChange={(e) => setCreditoFormData({ ...creditoFormData, comentario: e.target.value })} /></div>
                {creditoFormData.monto && parseFloat(creditoFormData.monto) > 0 && (
                  <div className="abonos-section">
                    <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>💰 Abonos</h3>
                    <div className="saldo-info">
                      {[['Total', 'total', '#0284c7'], ['Abonado', 'abonado', '#059669'], ['Pendiente', 'pendiente', '#f97316']].map(([label, key, color]) => { const s = calcularSaldosCredito(creditoFormData.monto, creditoFormData.abonos); return <div key={key} className="saldo-item"><label>{label}</label><div className="valor" style={{ color }}>${s[key].toFixed(2)}</div></div>; })}
                    </div>
                    <div className="abono-input-group"><input type="number" value={nuevoAbono} onChange={(e) => setNuevoAbono(e.target.value)} placeholder="Monto del abono..." step="0.01" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarAbono(); } }} /><button type="button" onClick={agregarAbono}>➕ Agregar</button></div>
                    {creditoFormData.abonos && creditoFormData.abonos.length > 0 && creditoFormData.abonos.map(abono => <div key={abono.id} className="abono-item"><div><div className="abono-monto">${abono.monto.toFixed(2)}</div><div className="abono-fecha">{abono.fechaFormato}</div></div><button type="button" onClick={() => eliminarAbono(abono.id)}>✕</button></div>)}
                  </div>
                )}
                <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={cerrarCreditoModal}>Cancelar</button><button type="submit" className="btn btn-primary">{editingCredito ? 'Actualizar' : 'Guardar'}</button></div>
              </form>
            </div>
          </div>

          {/* Búsqueda Global */}
          {showBusquedaGlobal && (
            <div className="modal show" onClick={e => { if (e.target === e.currentTarget) { setShowBusquedaGlobal(false); setBusquedaGlobal(''); }}}>
              <div className="modal-content" style={{ maxWidth: '600px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.3rem' }}>🔍</span>
                  <input autoFocus type="text" placeholder="Buscar en cartera y créditos..." value={busquedaGlobal} onChange={e => setBusquedaGlobal(e.target.value)} style={{ flex: 1, padding: '0.75rem 1rem', border: '2px solid var(--accent)', borderRadius: '10px', fontSize: '1rem', background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif' }} />
                  <button onClick={() => { setShowBusquedaGlobal(false); setBusquedaGlobal(''); }} className="close-btn">×</button>
                </div>
                {busquedaGlobal.length > 1 && (() => {
                  const term = busquedaGlobal.toLowerCase();
                  const resClientes = clientes.filter(c => c.nombre.toLowerCase().includes(term) || c.id.toString().includes(term) || (c.contacto||'').includes(term));
                  const resCreditos = creditos.filter(c => c.cliente.toLowerCase().includes(term) || c.numeroOrden.toLowerCase().includes(term));
                  return (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {resClientes.length > 0 && <>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>📊 Cartera ({resClientes.length})</div>
                        {resClientes.map(c => <div key={c.id} onClick={() => { setActiveTab('cartera'); setSearchTerm(c.nombre); setShowBusquedaGlobal(false); setBusquedaGlobal(''); }} style={{ padding: '0.65rem 0.9rem', background: 'var(--surface2)', borderRadius: '8px', marginBottom: '0.35rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div><strong>{c.nombre}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>#{c.id}</span></div>
                          <span className={`badge badge-${c.estado.toLowerCase().replace(/ /g,'-')}`}>{c.estado}</span>
                        </div>)}
                      </>}
                      {resCreditos.length > 0 && <>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0.75rem 0 0.5rem' }}>💳 Créditos ({resCreditos.length})</div>
                        {resCreditos.map(c => <div key={c.id} onClick={() => { setActiveTab('credito'); setShowBusquedaGlobal(false); setBusquedaGlobal(''); }} style={{ padding: '0.65rem 0.9rem', background: 'var(--surface2)', borderRadius: '8px', marginBottom: '0.35rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div><strong>{c.cliente}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Orden: {c.numeroOrden}</span></div>
                          <span className={`badge badge-${c.estado.toLowerCase().replace(/ /g,'-')}`}>{c.estado}</span>
                        </div>)}
                      </>}
                      {resClientes.length === 0 && resCreditos.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No se encontraron resultados para "{busquedaGlobal}"</div>}
                    </div>
                  );
                })()}
                {busquedaGlobal.length <= 1 && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Escribe al menos 2 letras para buscar</div>}
                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-light)', display: 'flex', gap: '1rem' }}>
                  <span><kbd style={{ background: 'var(--surface2)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border2)' }}>ESC</kbd> cerrar</span>
                  <span><kbd style={{ background: 'var(--surface2)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border2)' }}>F</kbd> abrir búsqueda</span>
                </div>
              </div>
            </div>
          )}

          {/* Modal WhatsApp */}
          {showWhatsappModal && whatsappCliente && (
            <div className="modal show">
              <div className="modal-content" style={{ maxWidth: '480px' }}>
                <div className="modal-header">
                  <h2>🟢 WhatsApp — {whatsappCliente.nombre}</h2>
                  <button className="close-btn" onClick={() => setShowWhatsappModal(false)}>×</button>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Plantillas</div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[
                      { label: '💰 Cobro', msg: `Hola ${whatsappCliente.nombre}, le recordamos que tiene un saldo pendiente de *$${(parseFloat(whatsappCliente.monto)||0).toLocaleString('en-US')}*. Por favor gestione su pago. Gracias.` },
                      { label: '⏰ Recordatorio', msg: `Hola ${whatsappCliente.nombre}, le contactamos para recordarle sobre su cuenta con estado *${whatsappCliente.estado}*. Quedamos atentos.` },
                      { label: '✅ Confirmación', msg: `Hola ${whatsappCliente.nombre}, confirmamos la recepción de su pago. Gracias por su gestión.` },
                      { label: '👋 Bienvenida', msg: `Hola ${whatsappCliente.nombre}, bienvenido a nuestros servicios. Estamos a su disposición para cualquier consulta.` },
                    ].map(t => <button key={t.label} onClick={() => setWhatsappMensaje(t.msg)} style={{ padding: '0.35rem 0.75rem', borderRadius: '7px', border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>{t.label}</button>)}
                  </div>
                </div>
                <div className="form-group">
                  <label>Mensaje</label>
                  <textarea value={whatsappMensaje} onChange={e => setWhatsappMensaje(e.target.value)} rows={6} style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border2)', borderRadius: '9px', fontSize: '0.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif', resize: 'vertical', background: 'var(--surface)', color: 'var(--text)' }} />
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowWhatsappModal(false)}>Cancelar</button>
                  <button className="btn btn-success" onClick={enviarWhatsapp}>🟢 Enviar por WhatsApp</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Importar Excel */}
          {showImportModal && (
            <div className="modal show">
              <div className="modal-content" style={{ maxWidth: '460px' }}>
                <div className="modal-header">
                  <h2>📥 Importar Clientes desde Excel</h2>
                  <button className="close-btn" onClick={() => setShowImportModal(false)}>×</button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>El archivo Excel debe tener estas columnas:</p>
                <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '0.9rem', marginBottom: '1.25rem', fontFamily: 'var(--mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  ID | Nombre | Contacto | Estado | Mes | Año | Monto | Comentario
                </div>
                <div style={{ textAlign: 'center', padding: '1.5rem', border: '2px dashed var(--border2)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📂</div>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>Selecciona tu archivo Excel</p>
                  <label style={{ padding: '0.65rem 1.5rem', background: 'var(--accent)', color: 'white', borderRadius: '9px', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                    Elegir archivo
                    <input type="file" accept=".xlsx,.xls" onChange={importarDesdeExcel} style={{ display: 'none' }} />
                  </label>
                </div>
                <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                  <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cerrar</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Historial de Pagos */}
          {showHistorialPagosModal && historialPagosCliente && (() => {
            const pagos = historialPagosCliente.pagosRealizados || [];
            const total = parseFloat(historialPagosCliente.monto) || 0;
            const totalPagado = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
            const pendiente = Math.max(total - totalPagado, 0);
            return (
              <div className="modal show">
                <div className="modal-content" style={{ maxWidth: '480px' }}>
                  <div className="modal-header">
                    <h2>📋 Historial de Pagos — {historialPagosCliente.nombre}</h2>
                    <button className="close-btn" onClick={() => setShowHistorialPagosModal(false)}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem', marginBottom: '1.2rem' }}>
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.7rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Total</div>
                      <div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#0284c7' }}>${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                    </div>
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '0.7rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#065f46', fontWeight: 700, textTransform: 'uppercase' }}>Pagado</div>
                      <div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#059669' }}>${totalPagado.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                    </div>
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.7rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#c2410c', fontWeight: 700, textTransform: 'uppercase' }}>Pendiente</div>
                      <div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#ea580c' }}>${pendiente.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                  {pagos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💸</div>
                      <p>No hay pagos registrados aún.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
                      {pagos.map((pago, i) => (
                        <div key={pago.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.7rem 1rem' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#1e2d4a', fontSize: '0.85rem' }}>Pago #{i + 1}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{pago.fechaFormato || new Date(pago.fecha).toLocaleDateString('es-DO')}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ fontWeight: 800, color: '#059669', fontSize: '1rem', fontFamily: 'monospace' }}>+${parseFloat(pago.monto).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <button onClick={() => generarReciboPDF(historialPagosCliente, pago)} title="Descargar recibo" style={{ padding: '0.25rem 0.55rem', borderRadius: '6px', border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0284c7', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>📄 Recibo</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                    <button className="btn btn-primary" onClick={() => setShowHistorialPagosModal(false)}>Cerrar</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Modal Pago Cliente */}
          {showPagoModal && pagoClienteTarget && (() => { const s = calcularSaldoCliente(pagoClienteTarget); return (
            <div className="modal show">
              <div className="modal-content" style={{ maxWidth: '420px' }}>
                <div className="modal-header"><h2>Pago - {pagoClienteTarget.nombre}</h2><button className="close-btn" onClick={() => setShowPagoModal(false)}>×</button></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}><div style={{ fontSize: '0.65rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Total</div><div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#0284c7' }}>${s.monto.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}><div style={{ fontSize: '0.65rem', color: '#065f46', fontWeight: 700, textTransform: 'uppercase' }}>Pagado</div><div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#059669' }}>${s.pagado.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}><div style={{ fontSize: '0.65rem', color: '#c2410c', fontWeight: 700, textTransform: 'uppercase' }}>Pendiente</div><div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#ea580c' }}>${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
                </div>
                <div className="form-group">
                  <label>Monto del Pago</label>
                  <input type="number" value={pagoMonto} onChange={e => setPagoMonto(e.target.value)} placeholder={`Max: $${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} step="0.01" min="0.01" autoFocus onKeyDown={e => { if (e.key === 'Enter') confirmarPago(); }} />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                    <button type="button" style={{ fontSize: '0.73rem', padding: '0.25rem 0.6rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '5px', cursor: 'pointer', color: '#0284c7', fontWeight: 600 }} onClick={() => setPagoMonto(s.pendiente.toFixed(2))}>Pago total (${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })})</button>
                    {s.pendiente > 0 && <button type="button" style={{ fontSize: '0.73rem', padding: '0.25rem 0.6rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px', cursor: 'pointer', color: '#15803d', fontWeight: 600 }} onClick={() => setPagoMonto((s.pendiente / 2).toFixed(2))}>50% (${(s.pendiente / 2).toLocaleString('en-US', { maximumFractionDigits: 0 })})</button>}
                  </div>
                </div>
                <div className="form-actions"><button className="btn btn-secondary" onClick={() => setShowPagoModal(false)}>Cancelar</button><button className="btn btn-success" onClick={confirmarPago}>Confirmar Pago</button></div>
              </div>
            </div>
          ); })()}

          {/* Modal Pago Crédito */}
          {showPagoCreditoModal && pagoCreditoTarget && (() => { const s = calcularSaldoCredito(pagoCreditoTarget); return (
            <div className="modal show">
              <div className="modal-content" style={{ maxWidth: '420px' }}>
                <div className="modal-header"><h2>Pago - {pagoCreditoTarget.cliente}</h2><button className="close-btn" onClick={() => setShowPagoCreditoModal(false)}>×</button></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}><div style={{ fontSize: '0.65rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>Total</div><div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#0284c7' }}>${s.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}><div style={{ fontSize: '0.65rem', color: '#065f46', fontWeight: 700, textTransform: 'uppercase' }}>Abonado</div><div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#059669' }}>${s.abonado.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.6rem', textAlign: 'center' }}><div style={{ fontSize: '0.65rem', color: '#c2410c', fontWeight: 700, textTransform: 'uppercase' }}>Pendiente</div><div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#ea580c' }}>${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
                </div>
                <div className="form-group">
                  <label>Monto del Pago</label>
                  <input type="number" value={pagoCreditoMonto} onChange={e => setPagoCreditoMonto(e.target.value)} placeholder={`Max: $${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} step="0.01" min="0.01" autoFocus onKeyDown={e => { if (e.key === 'Enter') confirmarPagoCredito(); }} />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                    <button type="button" style={{ fontSize: '0.73rem', padding: '0.25rem 0.6rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '5px', cursor: 'pointer', color: '#0284c7', fontWeight: 600 }} onClick={() => setPagoCreditoMonto(s.pendiente.toFixed(2))}>Pago total</button>
                    {s.pendiente > 0 && <button type="button" style={{ fontSize: '0.73rem', padding: '0.25rem 0.6rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px', cursor: 'pointer', color: '#15803d', fontWeight: 600 }} onClick={() => setPagoCreditoMonto((s.pendiente / 2).toFixed(2))}>50%</button>}
                  </div>
                </div>
                <div className="form-actions"><button className="btn btn-secondary" onClick={() => setShowPagoCreditoModal(false)}>Cancelar</button><button className="btn btn-success" onClick={confirmarPagoCredito}>Confirmar Pago</button></div>
              </div>
            </div>
          ); })()}

          {/* Modal Nota */}
          <div className={`modal ${showNotaModal ? 'show' : ''}`}>
            <div className="nota-modal-content">
              <div className="modal-header"><h2>💬 Nota del Cliente</h2><button className="close-btn" onClick={() => setShowNotaModal(false)}>✕</button></div>
              <p style={{ fontSize: '0.85rem', color: '#64748b' }}>{notaClienteId && clientes.find(c => c.id === notaClienteId)?.nombre}</p>
              <textarea value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)} placeholder="Escribe una nota..." />
              <div className="form-actions"><button className="btn btn-secondary" onClick={() => setShowNotaModal(false)}>Cancelar</button><button className="btn btn-success" onClick={guardarNota}>💾 Guardar</button></div>
            </div>
          </div>

          {/* Modal Guardar Mes */}
          <div className={`modal ${showDescargaMesModal ? 'show' : ''}`}>
            <div className="nota-modal-content">
              <div className="modal-header"><h2>💾 Guardar y Descargar Mes</h2><button className="close-btn" onClick={() => setShowDescargaMesModal(false)}>✕</button></div>
              <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '1.5rem' }}>Selecciona el formato de descarga:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button className="btn btn-primary" onClick={descargarMesExcel} style={{ width: '100%', justifyContent: 'center' }}>📊 Descargar en Excel</button>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '1rem', textAlign: 'center' }}>El mes se guardará en el historial automáticamente</p>
            </div>
          </div>

          <div id="save-indicator" className="save-indicator">✅ Guardado automáticamente</div>
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}${t.removing ? ' removing' : ''}`}>
            <span style={{ fontSize: '1rem' }}>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
