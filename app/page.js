'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getSupabaseBrowser } from '../lib/supabase-browser.js';
import * as XLSX from 'xlsx';
import { signIn, signOut, useSession } from 'next-auth/react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function App() {
  const { data: session, status: sessionStatus } = useSession({
    refetchInterval: 5 * 60,   // Verificar sesión cada 5 min
    refetchOnWindowFocus: true,
  });
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

  // Sincronizar estado con sesión NextAuth (login via Credentials o Google)
  useEffect(() => {
    if (session?.user) {
      setIsAuthenticated(true);
      const uname = session.user.username || session.user.email || '';
      setCurrentUser(uname.toUpperCase());
    } else if (sessionStatus !== 'loading') {
      // Sesión terminó (logout manual o expirada) → limpiar estado local
      setIsAuthenticated(false);
    }
  }, [session, sessionStatus]);

  const ADMIN_EMAILS = ['carlosperez@gmail.com'];

  // usuarios solo guarda info pública (rol, nombre) — sin contraseñas
  const [usuarios, setUsuarios] = useState({});
  const [showUsuariosModal, setShowUsuariosModal] = useState(false);
  const [usuarioForm, setUsuarioForm] = useState({ username: '', nombre: '', pass: '', rol: 'viewer' });
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [showPassActual, setShowPassActual] = useState(false);

  // Audit log
  const [showAuditModal, setShowAuditModal]   = useState(false);
  const [auditEntries, setAuditEntries]       = useState([]);
  const [auditLoading, setAuditLoading]       = useState(false);
  const [auditFilter, setAuditFilter]         = useState('');

  // Mobile menu
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Sesión expirada — detectar cuando pasa de authenticated → unauthenticated
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [nuevaVersion, setNuevaVersion] = useState(false);
  const prevSessionStatus = useRef(null);
  const versionRef = useRef(null);
  useEffect(() => {
    if (prevSessionStatus.current === "authenticated" && sessionStatus === "unauthenticated" && !window._manualLogout) {
      setSessionExpired(true);
    }
    prevSessionStatus.current = sessionStatus;
  }, [sessionStatus]);

  // Cargar lista pública de usuarios desde el servidor
  const cargarUsuarios = () => {
    fetch('/api/usuarios').then(r => r.json()).then(data => setUsuarios(data)).catch(() => {});
  };

  const cargarDelegations = () => {
    fetch('/api/delegations').then(r => r.json()).then(data => {
      if (data && data.comoDueno !== undefined) setDelegations(data);
    }).catch(() => {});
  };

  const cargarPendientes = () => {
    fetch('/api/delegations?pendientes=1').then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setDelegationsPendientes(data);
        setPendienteIdx(0);
        setShowPendienteModal(true);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    if (isAuthenticated || session) {
      cargarUsuarios();
      cargarDelegations();
      cargarPendientes();
    }
  }, [isAuthenticated, session]);

  // Si hay sesión NextAuth: usar el rol del token JWT o el email de Google
  // Si no: fallback a la lista local (para compatibilidad)
  const esAdmin = session
    ? (session.user?.rol === 'admin' || ADMIN_EMAILS.includes(session.user?.email))
    : (usuarios[currentUser]?.rol === 'admin');
  const ROLES_EDITOR    = ['editor', 'agente_cobro', 'contabilidad', 'supervisor_cobro', 'supervisor_contabilidad'];
  const ROLES_VER_TODO  = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];
  const rolActual       = session ? (session.user?.rol || '') : (usuarios[currentUser]?.rol || '');
  const esEditor        = ROLES_EDITOR.includes(rolActual);
  const puedeVerTodo    = esAdmin || ROLES_VER_TODO.includes(rolActual);
  const soloLectura     = !esAdmin && !esEditor;

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const result = await signIn('credentials', {
        redirect: false,
        username: username.trim(),
        password,
      });
      if (result?.ok) {
        setIsAuthenticated(true);
        setCurrentUser(username.trim().toUpperCase());
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('currentUser', username.trim().toUpperCase());
        cargarUsuarios();
      } else {
        setLoginError('❌ ' + (result?.error || 'Usuario o contraseña incorrectos'));
      }
    } catch {
      setLoginError('❌ Error de conexión con el servidor');
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
    const savedHistorial = localStorage.getItem('historial-meses-v1');
    setHistorialMeses(savedHistorial ? JSON.parse(savedHistorial) : {});
    setHydrated(true);
  }, []);

  // — Funciones de carga separadas (estables con useCallback) —
  const cargarClientes = useCallback(async () => {
    try {
      const [resC, resDelC] = await Promise.all([
        fetch('/api/clientes'),
        fetch('/api/delegacion-clientes'),
      ]);
      const propios   = resC.ok    ? await resC.json()    : [];
      const delegados = resDelC.ok ? await resDelC.json() : [];
      const mapa = new Map();
      [...(Array.isArray(propios)   ? propios   : []),
       ...(Array.isArray(delegados) ? delegados : [])].forEach(c => mapa.set(c.id, c));
      setClientes([...mapa.values()]);
    } catch { /* offline — mantener datos en pantalla */ }
  }, []);

  const cargarCreditos = useCallback(async () => {
    try {
      const res = await fetch('/api/creditos');
      const data = res.ok ? await res.json() : null;
      if (Array.isArray(data)) setCreditos(data);
    } catch { /* offline — mantener datos en pantalla */ }
  }, []);

  // Carga inicial + suscripción Supabase Realtime
  useEffect(() => {
    if (!session?.user) return;

    // Carga inicial de datos
    cargarClientes();
    cargarCreditos();

    // Supabase Realtime — reemplaza el setInterval por eventos en tiempo real
    const supabase = getSupabaseBrowser();
    if (!supabase) return; // anon key no configurada — sin realtime

    const channel = supabase
      .channel('cartera-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'clientes' },
        () => cargarClientes()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'creditos' },
        () => cargarCreditos()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'delegations' },
        () => {
          // Un cambio en delegaciones afecta qué clientes son visibles
          cargarClientes();
          cargarCreditos();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Error en canal — verifica que las tablas tienen Realtime habilitado en Supabase.');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.username, cargarClientes, cargarCreditos]);

  // Detectar nueva versión desplegada — cerrar sesión y recargar automáticamente
  useEffect(() => {
    if (!session?.user) return;

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const { version } = await res.json();
        if (version === 'dev') return; // En desarrollo local no verificar
        if (versionRef.current === null) {
          versionRef.current = version; // Primera carga: guardar versión actual
          return;
        }
        if (version !== versionRef.current) {
          setNuevaVersion(true);
          // Cerrar sesión y recargar después de 3 segundos
          setTimeout(async () => {
            await signOut({ redirect: false });
            window.location.href = '/';
          }, 3000);
        }
      } catch { /* offline — ignorar */ }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 60 * 1000); // verificar cada minuto
    return () => clearInterval(interval);
  }, [session?.user?.username]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [showNotaModal, setShowNotaModal] = useState(false);
  const [showDescargaMesModal, setShowDescargaMesModal] = useState(false);
  const [notaClienteId, setNotaClienteId] = useState(null);
  const [notaTexto, setNotaTexto] = useState('');
  const [editingCliente, setEditingCliente] = useState(null);
  const [formData, setFormData] = useState({ id: '', codigoCliente: '', nombre: '', contacto: '', estado: 'Cotizado', fechaCotizacion: '', fechaNotificacion: '', fechaPago: '', fechaFacturacion: '', fechaSuspension: '', mes: '', año: '', monto: '', comentario: '', historial: [] });
  const [pdfCargando, setPdfCargando] = useState(false);
  const [pdfError,    setPdfError]    = useState('');
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
  const [filtroAgente, setFiltroAgente] = useState('');
  const [confirmModal, setConfirmModal] = useState({ show: false, titulo: '', mensaje: '', onConfirm: null });
  // — Delegations —
  const [delegations, setDelegations] = useState({ comoDueno: [], comoRecibidas: [] });
  const [showPendienteModal, setShowPendienteModal] = useState(false);
  const [delegationsPendientes, setDelegationsPendientes] = useState([]);
  const [pendienteIdx, setPendienteIdx] = useState(0);
  const [showCrearDelegacionModal, setShowCrearDelegacionModal] = useState(false);
  const [delegacionWizardStep, setDelegacionWizardStep] = useState(1);
  const [delegacionForm, setDelegacionForm] = useState({ assignedUserId: '', startDate: '', endDate: '', tipo: 'total', clienteIds: [], permisos: { can_edit: true, can_register_payments: true, can_delete: false, read_only: false } });
  const [delegacionBusquedaCliente, setDelegacionBusquedaCliente] = useState('');
  const [actividad, setActividad] = useState([]);
  const [actividadFiltro, setActividadFiltro] = useState({ delegationId: '', desde: '', hasta: '' });
  const [actividadTab, setActividadTab] = useState('delegations'); // 'delegations' | 'recibidas' | 'actividad'
  const mostrarConfirm = (titulo, mensaje, onConfirm) => setConfirmModal({ show: true, titulo, mensaje, onConfirm });
  const cerrarConfirm  = () => setConfirmModal({ show: false, titulo: '', mensaje: '', onConfirm: null });
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
  const [modoCompacto, setModoCompacto] = useState(false);
  const [metaMensual, setMetaMensual] = useState(0);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsSection, setSettingsSection] = useState('config');
  const [colorAcento, setColorAcento] = useState('#635bff');
  const [tags, setTags] = useState({});
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagClienteId, setTagClienteId] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [showBusquedaAvanzada, setShowBusquedaAvanzada] = useState(false);
  const [filtroMontoMin, setFiltroMontoMin] = useState('');
  const [filtroMontoMax, setFiltroMontoMax] = useState('');
  const [filtroEstados, setFiltroEstados] = useState([]);
  const [recordatoriosDias, setRecordatoriosDias] = useState(7);

  // ── Documentos / Cotizaciones ────────────────────────────
  const [cotizaciones, setCotizaciones] = useState({});          // { clienteId: [{id, nombre, base64, fecha, monto}] }
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [docsClienteId, setDocsClienteId] = useState(null);
  const [nuevaCotForm, setNuevaCotForm] = useState({ monto: '', estado: 'Cotizado', show: false });
  const [showGenCotModal, setShowGenCotModal] = useState(false);
  const [genCotCliente, setGenCotCliente] = useState(null);
  const [cotItems, setCotItems] = useState([{ descripcion: '', cantidad: 1, precio: '' }]);
  const [cotNota, setCotNota] = useState('');
  const [cotValidez, setCotValidez] = useState(30);
  const [showNotifDocModal, setShowNotifDocModal] = useState(false);
  const [notifDocCliente, setNotifDocCliente] = useState(null);
  const [notifDocSeleccionado, setNotifDocSeleccionado] = useState(null);
  const [notifDocMensaje, setNotifDocMensaje] = useState('');
  const [showCargaMasivaModal, setShowCargaMasivaModal] = useState(false);
  const [archivosEnProceso, setArchivosEnProceso] = useState([]);
  const [cargaMasivaProcesando, setCargaMasivaProcesando] = useState(false);

  // ── Bitácora de Gestiones ────────────────────────────────
  const [gestiones, setGestiones] = useState({});
  const [showGestionModal, setShowGestionModal] = useState(false);
  const [gestionClienteId, setGestionClienteId] = useState(null);
  const [gestionTipo, setGestionTipo] = useState('Llamada');
  const [gestionResultado, setGestionResultado] = useState('Contestó');
  const [gestionNota, setGestionNota] = useState('');
  const [gestionProximaFecha, setGestionProximaFecha] = useState('');
  const [showHistorialGestionModal, setShowHistorialGestionModal] = useState(false);
  const [historialGestionCliente, setHistorialGestionCliente] = useState(null);

  // ── Plantillas de WhatsApp ───────────────────────────────
  const [plantillas, setPlantillas] = useState([]);
  const [showPlantillasModal, setShowPlantillasModal] = useState(false);
  const [plantillaEditando, setPlantillaEditando] = useState(null);
  const [plantillaForm, setPlantillaForm] = useState({ nombre: '', texto: '' });

  // ── WhatsApp Masivo ──────────────────────────────────────
  const [clientesSeleccionados, setClientesSeleccionados] = useState([]);
  const [showWaMasivoModal, setShowWaMasivoModal] = useState(false);
  const [waMasivoMensaje, setWaMasivoMensaje] = useState('');
  const [waMasivoIndex, setWaMasivoIndex] = useState(0);
  const [waMasivoActivo, setWaMasivoActivo] = useState(false);

  // Cargar preferencias guardadas
  useEffect(() => {
    const savedMeta = localStorage.getItem('meta-mensual');
    const savedColor = localStorage.getItem('color-acento');
    const savedTags = localStorage.getItem('cliente-tags');
    const savedRecordatorio = localStorage.getItem('recordatorio-dias');
    const savedCompacto = localStorage.getItem('modo-compacto');
    const savedCots = localStorage.getItem('cotizaciones-v2') || localStorage.getItem('cotizaciones-v1');
    if (savedMeta) setMetaMensual(parseFloat(savedMeta) || 0);
    if (savedColor) setColorAcento(savedColor);
    if (savedTags) setTags(JSON.parse(savedTags));
    if (savedRecordatorio) setRecordatoriosDias(parseInt(savedRecordatorio) || 7);
    if (savedCompacto) setModoCompacto(savedCompacto === 'true');
    if (savedCots) {
      const parsed = JSON.parse(savedCots);
      const migradas = Object.fromEntries(
        Object.entries(parsed).map(([cid, docs]) => [
          cid, docs.map(d => ({ ...d, estado: d.estado || 'Cotizado' }))
        ])
      );
      setCotizaciones(migradas);
    }
    const savedGestiones = localStorage.getItem('gestiones-v1');
    if (savedGestiones) setGestiones(JSON.parse(savedGestiones));
    const savedPlantillas = localStorage.getItem('plantillas-v1');
    if (savedPlantillas) setPlantillas(JSON.parse(savedPlantillas));
    else setPlantillas([
      { id: 1, nombre: 'Primer Aviso', texto: 'Estimado/a {nombre}, le recordamos que tiene una factura pendiente por RD${monto}. Por favor comuníquese con nosotros. Gracias.' },
      { id: 2, nombre: 'Recordatorio', texto: 'Estimado/a {nombre}, su cuenta por RD${monto} sigue pendiente. Le agradecemos se ponga en contacto a la brevedad.' },
      { id: 3, nombre: 'Aviso de Vencimiento', texto: '⚠️ Estimado/a {nombre}, su factura por RD${monto} está próxima a vencer. Realice el pago antes de la fecha límite.' },
      { id: 4, nombre: 'Aviso Final', texto: '🔴 AVISO FINAL — Estimado/a {nombre}, su deuda de RD${monto} requiere atención inmediata. Contáctenos en los próximos 3 días.' },
      { id: 5, nombre: 'Confirmación de Pago', texto: '✅ Estimado/a {nombre}, confirmamos recibo de su pago. Muchas gracias por su pronta respuesta.' },
    ]);
  }, []);

  useEffect(() => { if (Object.keys(gestiones).length >= 0) localStorage.setItem('gestiones-v1', JSON.stringify(gestiones)); }, [gestiones]);
  useEffect(() => { if (plantillas.length > 0) localStorage.setItem('plantillas-v1', JSON.stringify(plantillas)); }, [plantillas]);

  // Migración legacy: crear cotizacion para clientes con monto pero sin docs
  useEffect(() => {
    if (!clientes.length) return;
    setCotizaciones(prev => {
      let changed = false;
      const result = { ...prev };
      clientes.forEach(c => {
        if (parseFloat(c.monto) > 0 && !(result[c.id]?.length > 0)) {
          const estadoValido = ['Cotizado','Notificado','Pagado','Facturado','Vencido'].includes(c.estado) ? c.estado : 'Cotizado';
          result[c.id] = [{ id: Date.now() + Math.random(), nombre: null, base64: null, fecha: new Date().toISOString(), monto: parseFloat(c.monto), tipo: 'legacy', estado: estadoValido }];
          changed = true;
        }
      });
      return changed ? result : prev;
    });
  }, [clientes]);

  useEffect(() => {
    if (Object.keys(cotizaciones).length >= 0) {
      try { localStorage.setItem('cotizaciones-v2', JSON.stringify(cotizaciones)); } catch { showToast('Almacenamiento lleno. Elimina documentos antiguos.', 'error'); }
    }
  }, [cotizaciones]);

  // Aplicar color de acento como variable CSS
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', colorAcento);
    const hex = colorAcento.replace('#','');
    const r = parseInt(hex.substring(0,2),16), g = parseInt(hex.substring(2,4),16), b = parseInt(hex.substring(4,6),16);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.15)`);
    localStorage.setItem('color-acento', colorAcento);
  }, [colorAcento]);

  useEffect(() => { localStorage.setItem('meta-mensual', metaMensual); }, [metaMensual]);
  useEffect(() => { if (Object.keys(tags).length > 0) localStorage.setItem('cliente-tags', JSON.stringify(tags)); }, [tags]);
  useEffect(() => { localStorage.setItem('recordatorio-dias', recordatoriosDias); }, [recordatoriosDias]);
  useEffect(() => { localStorage.setItem('modo-compacto', modoCompacto); }, [modoCompacto]);
  useEffect(() => { localStorage.setItem('usuarios-v1', JSON.stringify(usuarios)); }, [usuarios]);

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

  // ── Auto-logout por inactividad (30 minutos) ──────────────
  useEffect(() => {
    if (!isAuthenticated && !session) return;
    const TIMEOUT = 30 * 60 * 1000;
    const cerrarSesion = () => {
      if (session) { signOut({ callbackUrl: '/' }); }
      else { setIsAuthenticated(false); localStorage.removeItem('isLoggedIn'); localStorage.removeItem('currentUser'); window.location.reload(); }
    };
    let timer = setTimeout(cerrarSesion, TIMEOUT);
    const reset = () => { clearTimeout(timer); timer = setTimeout(cerrarSesion, TIMEOUT); };
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('click', reset);
    return () => { clearTimeout(timer); window.removeEventListener('mousemove', reset); window.removeEventListener('keydown', reset); window.removeEventListener('click', reset); };
  }, [isAuthenticated, session]);

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

  // Indicador de guardado deshabilitado — el sistema guarda silenciosamente

  const datosActuales = mesVisualizando === obtenerMesActual()
    ? { clientes, creditos }
    : (historialMeses[mesVisualizando] || { clientes: [], creditos: [] });

  const calcularSaldoCliente = (cliente) => {
    const monto = parseFloat(cliente.monto) || 0;
    const pagado = (cliente.pagosRealizados || []).reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    return { monto, pagado, pendiente: Math.max(0, monto - pagado) };
  };

  const estadoActivoCliente = (cliente) => {
    const docs = cotizaciones[cliente.id] || [];
    if (!docs.length) return cliente.estado;
    return docs.reduce((a, b) => (a.id > b.id ? a : b)).estado;
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
    // Aplanar todas las cotizaciones con su clienteId
    const todasCots = Object.entries(cotizaciones).flatMap(([cid, docs]) =>
      (docs || []).map(d => ({ ...d, clienteId: cid }))
    );
    const sumMonto = (arr) => arr.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
    const clientesConEstado = (est) => new Set(todasCots.filter(d => d.estado === est).map(d => d.clienteId)).size;
    const cotizados   = todasCots.filter(d => d.estado === 'Cotizado');
    const notificados = todasCots.filter(d => d.estado === 'Notificado');
    const pagados     = todasCots.filter(d => d.estado === 'Pagado');
    const facturados  = todasCots.filter(d => d.estado === 'Facturado');
    const vencidos    = todasCots.filter(d => d.estado === 'Vencido');
    const suspendidos = clientesData.filter(c => c.suspendido === true);
    const noGeneraron = clientesData.filter(c => c.estado === 'No Generaron');
    return {
      cotizado: clientesConEstado('Cotizado'), notificado: clientesConEstado('Notificado'),
      pagado: clientesConEstado('Pagado'), facturado: clientesConEstado('Facturado'),
      vencido: clientesConEstado('Vencido'), suspendido: suspendidos.length,
      noGeneraron: noGeneraron.length, total,
      montoCotizado: sumMonto(cotizados), montoNotificado: sumMonto(notificados),
      montoPagado: sumMonto(pagados), montoFacturado: sumMonto(facturados),
      montoVencido: sumMonto(vencidos),
      montoSuspendido: suspendidos.reduce((acc, c) => {
        const m = parseFloat(c.monto) || 0;
        const p = (c.pagosRealizados || []).reduce((s, x) => s + (parseFloat(x.monto) || 0), 0);
        return acc + Math.max(0, m - p);
      }, 0),
      cotizadoPct:    total > 0 ? ((clientesConEstado('Cotizado')   / total) * 100).toFixed(0) : 0,
      notificadoPct:  total > 0 ? ((clientesConEstado('Notificado') / total) * 100).toFixed(0) : 0,
      pagadoPct:      total > 0 ? ((clientesConEstado('Pagado')     / total) * 100).toFixed(0) : 0,
      facturadoPct:   total > 0 ? ((clientesConEstado('Facturado')  / total) * 100).toFixed(1) : 0,
      vencidoPct:     total > 0 ? ((clientesConEstado('Vencido')    / total) * 100).toFixed(1) : 0,
      suspendidoPct:  total > 0 ? ((suspendidos.length / total) * 100).toFixed(1) : 0,
      noGeneraronPct: total > 0 ? ((noGeneraron.length / total) * 100).toFixed(1) : 0,
    };
  }, [datosActuales.clientes, cotizaciones]);

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
    const myUsername = (session?.user?.username || '').toLowerCase();
    if (filter === 'delegaciones') {
      // Solo clientes delegados (creados por otro usuario)
      resultado = resultado.filter(c => c.creadoPor.toLowerCase() !== myUsername);
    } else if (!puedeVerTodo) {
      // Cartera propia: solo los del usuario actual
      resultado = resultado.filter(c => c.creadoPor.toLowerCase() === myUsername);
    }
    if (filtroAgente) resultado = resultado.filter(c => c.creadoPor === filtroAgente);
    if (searchTerm) resultado = resultado.filter(c => c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || (c.contacto || '').includes(searchTerm) || c.id.toString().includes(searchTerm));
    if (fechaDesde) resultado = resultado.filter(c => c.fechaCotizacion && c.fechaCotizacion >= fechaDesde);
    if (fechaHasta) resultado = resultado.filter(c => c.fechaCotizacion && c.fechaCotizacion <= fechaHasta);
    if (filtroMontoMin !== '') resultado = resultado.filter(c => (parseFloat(c.monto) || 0) >= parseFloat(filtroMontoMin));
    if (filtroMontoMax !== '') resultado = resultado.filter(c => (parseFloat(c.monto) || 0) <= parseFloat(filtroMontoMax));
    if (filtroEstados.length > 0) resultado = resultado.filter(c => filtroEstados.includes(estadoActivoCliente(c)));
    else if (filter !== 'todos' && filter !== 'delegaciones') {
      if (filter === 'no-generaron') resultado = resultado.filter(c => c.estado === 'No Generaron');
      else resultado = resultado.filter(c => estadoActivoCliente(c).toLowerCase() === filter);
    }
    resultado = [...resultado].sort((a, b) => {
      let comparacion = 0;
      if (ordenarPor === 'prioridad') {
        const p = { 'Vencido': 1, 'Notificado': 2, 'Cotizado': 3, 'Pagado': 4, 'Facturado': 5, 'No Generaron': 6 };
        comparacion = (p[estadoActivoCliente(a)] || 999) - (p[estadoActivoCliente(b)] || 999);
      } else if (ordenarPor === 'id') comparacion = parseInt(a.id) - parseInt(b.id);
      else if (ordenarPor === 'nombre') comparacion = a.nombre.localeCompare(b.nombre);
      else if (ordenarPor === 'monto') comparacion = parseFloat(a.monto || 0) - parseFloat(b.monto || 0);
      return direccionOrden === 'asc' ? comparacion : -comparacion;
    });
    return resultado;
  }, [datosActuales.clientes, searchTerm, filter, ordenarPor, direccionOrden, puedeVerTodo, session?.user?.username, cotizaciones]);

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
      setEditingCliente(null);
      setFormData({ codigoCliente: '', nombre: '', contacto: '', estado: 'Cotizado', fechaCotizacion: hoy.toISOString().split('T')[0], fechaNotificacion: '', fechaPago: '', fechaFacturacion: '', fechaSuspension: '', mes: (hoy.getMonth() + 1).toString(), año: hoy.getFullYear().toString(), monto: '', comentario: '', historial: [] });
    }
    setShowModal(true);
  };

  const cerrarModal = () => { setShowModal(false); setEditingCliente(null); setPdfError(''); };

  // Lee una factura PDF y autocompleta el campo monto
  const leerFacturaPDF = async (archivo) => {
    if (!archivo) return;
    setPdfCargando(true);
    setPdfError('');
    try {
      const fd = new FormData();
      fd.append('pdf', archivo);
      const res  = await fetch('/api/leer-pdf', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.monto != null) {
        setFormData(prev => ({ ...prev, monto: String(data.monto) }));
      } else {
        // Mostrar error + preview del texto extraído si el backend lo devuelve
        const msg = data.error || 'No se pudo leer el PDF.';
        const preview = data.previewTexto
          ? `\n\nTexto detectado:\n${data.previewTexto.slice(0, 300)}`
          : '';
        setPdfError(msg + preview);
      }
    } catch {
      setPdfError('Error de conexión al leer el PDF.');
    } finally {
      setPdfCargando(false);
    }
  };

  // ── Helpers: actualizar estado local + persistir en API ─────────────────
  const actualizarCliente = async (clienteActualizado) => {
    const idNum = parseInt(clienteActualizado.id);
    if (!idNum || isNaN(idNum)) {
      showToast('Este cliente aún no está en la base de datos. Guárdalo primero.', 'error');
      return;
    }
    setClientes(prev => prev.map(c => c.id === clienteActualizado.id ? clienteActualizado : c));
    try {
      const r = await fetch(`/api/clientes/${idNum}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clienteActualizado) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); showToast('Error al guardar cliente: ' + (d.error || r.status), 'error'); }
    } catch { showToast('Sin conexión — cambio no guardado en servidor', 'error'); }
  };

  const actualizarCredito = async (creditoActualizado) => {
    const idNum = Number(creditoActualizado.id);
    if (!creditoActualizado.id || isNaN(idNum) || idNum <= 0) {
      showToast('Este crédito aún no está en la base de datos. Guárdalo primero.', 'error');
      return;
    }
    setCreditos(prev => prev.map(c => c.id === creditoActualizado.id ? creditoActualizado : c));
    try {
      const r = await fetch(`/api/creditos/${creditoActualizado.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creditoActualizado) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); showToast('Error al guardar crédito: ' + (d.error || r.status), 'error'); }
    } catch { showToast('Sin conexión — cambio no guardado en servidor', 'error'); }
  };

  // — Funciones de Delegación —
  const responderDelegacion = async (id, accion) => {
    try {
      const r = await fetch(`/api/delegations/${id}/responder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }) });
      const d = await r.json();
      if (r.ok) {
        showToast(accion === 'aceptar' ? '✅ Delegación aceptada. Los clientes ya están en tu cartera.' : 'Delegación rechazada.', accion === 'aceptar' ? 'success' : 'info');
        // Siguiente pendiente si hay más
        const resto = delegationsPendientes.slice(1);
        if (resto.length > 0) { setDelegationsPendientes(resto); setPendienteIdx(0); }
        else { setShowPendienteModal(false); setDelegationsPendientes([]); }
        if (accion === 'aceptar') {
          cargarClientes();
        }
        cargarDelegations();
      } else { showToast(d.error || 'Error al responder.', 'error'); }
    } catch { showToast('Sin conexión.', 'error'); }
  };

  const cancelarDelegacion = async (id) => {
    mostrarConfirm('Cancelar Delegación', '¿Estás seguro de que deseas cancelar esta delegación? Los clientes regresarán al dueño original.', async () => {
      try {
        const r = await fetch(`/api/delegations/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
        if (r.ok) { showToast('Delegación cancelada.', 'info'); cargarDelegations(); }
        else { const d = await r.json(); showToast(d.error || 'Error.', 'error'); }
      } catch { showToast('Sin conexión.', 'error'); }
    });
  };

  const crearDelegacion = async () => {
    try {
      const r = await fetch('/api/delegations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(delegacionForm) });
      const d = await r.json();
      if (r.ok) {
        showToast('Delegación enviada. El usuario debe aceptarla.', 'success');
        setShowCrearDelegacionModal(false);
        setDelegacionWizardStep(1);
        setDelegacionForm({ assignedUserId: '', startDate: '', endDate: '', tipo: 'total', clienteIds: [], permisos: { can_edit: true, can_register_payments: true, can_delete: false, read_only: false } });
        cargarDelegations();
      } else { showToast(d.error || 'Error al crear delegación.', 'error'); }
    } catch { showToast('Sin conexión.', 'error'); }
  };

  const cargarActividad = async (filtros = {}) => {
    const params = new URLSearchParams();
    if (filtros.delegationId) params.set('delegationId', filtros.delegationId);
    if (filtros.desde) params.set('desde', filtros.desde);
    if (filtros.hasta) params.set('hasta', filtros.hasta);
    try {
      const r = await fetch('/api/actividad?' + params.toString()); const d = await r.json();
      if (Array.isArray(d)) setActividad(d);
    } catch {}
  };

  const guardarCliente = async (e) => {
    e.preventDefault();
    const nuevoHistorial = [...(formData.historial || [])];
    nuevoHistorial.push({ fecha: new Date().toISOString(), accion: editingCliente ? `Actualizado - Estado: ${formData.estado}` : `Creado - Estado: ${formData.estado}`, usuario: currentUser || 'SISTEMA' });
    const clienteConHistorial = { ...formData, historial: nuevoHistorial };
    if (editingCliente) {
      await actualizarCliente({ ...clienteConHistorial, id: editingCliente.id });
    } else {
      try {
        const r = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clienteConHistorial) });
        const data = await r.json();
        if (r.ok) setClientes(prev => [...prev, data]);
        else showToast('Error al guardar: ' + data.error, 'error');
      } catch { showToast('Error de conexión', 'error'); }
    }
    cerrarModal();
  };

  const eliminarCliente = async (id) => {
    const cliente = clientes.find(c => c.id === id);
    mostrarConfirm(
      '¿Eliminar cliente?',
      `¿Estás seguro que deseas eliminar a "${cliente?.nombre || id}"? Esta acción eliminará también sus pagos, documentos y gestiones registradas.`,
      async () => {
        setClientes(prev => prev.filter(c => c.id !== id));
        try {
          const r = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
          if (!r.ok) { const d = await r.json().catch(() => ({})); showToast('Error al eliminar: ' + (d.error || r.status), 'error'); }
        } catch { showToast('Sin conexión — cliente no eliminado del servidor', 'error'); }
      }
    );
  };

  const abrirNotaModal = (cliente) => { setNotaClienteId(cliente.id); setNotaTexto(cliente.nota || ''); setShowNotaModal(true); };
  const guardarNota = () => {
    const updated = clientes.find(c => c.id === notaClienteId);
    if (updated) actualizarCliente({ ...updated, nota: notaTexto });
    setShowNotaModal(false);
  };

  const iniciarEdicionMonto = (cliente) => { setEditingMontoId(cliente.id); setTempMonto(cliente.monto || ''); };
  const guardarMontoInline = (clienteId) => {
    if (tempMonto === '' || isNaN(parseFloat(tempMonto))) { showToast('Monto inválido', 'error'); return; }
    const updated = clientes.find(c => c.id === clienteId);
    if (updated) actualizarCliente({ ...updated, monto: tempMonto, historial: [...(updated.historial || []), { fecha: new Date().toISOString(), accion: `Monto actualizado a $${tempMonto}`, usuario: currentUser || 'SISTEMA' }] });
    setEditingMontoId(null); setTempMonto('');
  };
  const cancelarEdicionMonto = () => { setEditingMontoId(null); setTempMonto(''); };

  const iniciarEdicionCreditoMonto = (credito) => { setEditingCreditoMontoId(credito.id); setTempCreditoMonto(credito.monto || ''); };
  const guardarCreditoMontoInline = (creditoId) => {
    const montoNorm = tempCreditoMonto.replace(',', '.');
    const montoNum = parseFloat(montoNorm);
    if (tempCreditoMonto === '' || isNaN(montoNum) || montoNum <= 0) { showToast('Monto inválido', 'error'); return; }
    const updated = creditos.find(c => c.id === creditoId);
    if (updated) actualizarCredito({ ...updated, monto: String(montoNum), historial: [...(updated.historial || []), { fecha: new Date().toISOString(), accion: `Monto actualizado a $${montoNum}`, usuario: currentUser || 'SISTEMA' }] });
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
    const clienteActualizado = { ...pagoClienteTarget, pagosRealizados: pagosActualizados, estado: pagadoCompleto ? 'Pagado' : pagoClienteTarget.estado, fechaPago: pagadoCompleto ? new Date().toISOString().split('T')[0] : pagoClienteTarget.fechaPago, historial: [...(pagoClienteTarget.historial || []), { fecha: new Date().toISOString(), accion: `Pago registrado: ${montoPagado.toLocaleString()} / Total: ${totalPagado.toLocaleString()} de ${montoTotal.toLocaleString()}`, usuario: currentUser || 'SISTEMA' }] };
    setClientes(prev => prev.map(c => c.id === pagoClienteTarget.id ? clienteActualizado : c));
    if (pagadoCompleto) sincronizarEstadoCotizacion(pagoClienteTarget.id, 'Pagado');
    setShowPagoModal(false); setPagoClienteTarget(null); setPagoMonto('');
    fetch(`/api/clientes/${clienteActualizado.id}/pagos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevoPago) }).catch(() => null);
    fetch(`/api/clientes/${clienteActualizado.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clienteActualizado) }).catch(() => null);
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
    const creditoActualizado = { ...pagoCreditoTarget, abonos: abonosActualizados, estado: pagadoCompleto ? 'Pagado' : pagoCreditoTarget.estado, fechaPagoC: pagadoCompleto ? new Date().toISOString().split('T')[0] : pagoCreditoTarget.fechaPagoC, historial: [...(pagoCreditoTarget.historial || []), { fecha: new Date().toISOString(), accion: `Pago: ${montoPagado.toLocaleString()} / Total abonado: ${totalAbonado.toLocaleString()} de ${montoTotal.toLocaleString()}`, usuario: currentUser || 'SISTEMA' }] };
    setCreditos(prev => prev.map(c => c.id === pagoCreditoTarget.id ? creditoActualizado : c));
    setShowPagoCreditoModal(false); setPagoCreditoTarget(null); setPagoCreditoMonto('');
    actualizarCredito(creditoActualizado);
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

  const eliminarAbono = (abonoId) => { mostrarConfirm('¿Eliminar abono?', '¿Estás seguro que deseas eliminar este abono?', () => setCreditoFormData({ ...creditoFormData, abonos: creditoFormData.abonos.filter(a => a.id !== abonoId) })); };

 const guardarCredito = async (e) => {
  e.preventDefault();
  const montoNorm = String(creditoFormData.monto).replace(',', '.');
  const entrada = { ...creditoFormData, monto: montoNorm, abonos: creditoFormData.abonos || [], historial: [...(creditoFormData.historial || []), { fecha: new Date().toISOString(), accion: editingCredito ? `Actualizado: ${creditoFormData.estado}` : `Creado: ${creditoFormData.estado}` }] };
  if (editingCredito) {
    await actualizarCredito({ ...entrada, id: editingCredito.id });
  } else {
    try {
      const r = await fetch('/api/creditos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entrada) });
      const data = await r.json();
      if (r.ok) setCreditos(prev => [...prev, data]);
      else showToast('Error al guardar crédito: ' + data.error, 'error');
    } catch { showToast('Error de conexión', 'error'); }
  }
  cerrarCreditoModal();
};

  const eliminarCredito = async (id) => {
    const credito = creditos.find(c => c.id === id);
    mostrarConfirm(
      '¿Eliminar crédito?',
      `¿Estás seguro que deseas eliminar el crédito de "${credito?.cliente || id}"? Esta acción eliminará también todos sus abonos.`,
      async () => {
        setCreditos(prev => prev.filter(c => c.id !== id));
        try {
          const r = await fetch(`/api/creditos/${id}`, { method: 'DELETE' });
          if (!r.ok) { const d = await r.json().catch(() => ({})); showToast('Error al eliminar: ' + (d.error || r.status), 'error'); }
        } catch { showToast('Sin conexión — crédito no eliminado del servidor', 'error'); }
      }
    );
  };

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

  const playSound = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'error') {
        // Sonido descendente suave — "pop" de error
        osc.type = 'sine';
        osc.frequency.setValueAtTime(480, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
      } else if (type === 'success') {
        // Sonido ascendente suave — confirmación
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch { /* silencioso si el navegador bloquea */ }
  };

  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    if (type === 'error' || type === 'success') playSound(type);
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
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        const nuevos = data.map((row) => ({
          nombre:          row['Nombre']          || row['nombre']          || '',
          contacto:        row['Contacto']         || row['contacto']         || '',
          estado:          row['Estado']           || row['estado']           || 'Cotizado',
          mes:             String(row['Mes']       || row['mes']       || new Date().getMonth() + 1),
          año:             String(row['Año']       || row['año']       || new Date().getFullYear()),
          monto:           row['Monto'] ? String(row['Monto']).replace(/[$,]/g, '') : '',
          fechaCotizacion: row['Fecha Cotización'] || '',
          comentario:      row['Comentario']       || '',
          pagosRealizados: [],
          historial:       [],
        })).filter(c => c.nombre);
        if (!nuevos.length) { alert('No se encontraron clientes en el archivo.'); return; }
        if (!confirm(`Se importarán ${nuevos.length} clientes a la base de datos. ¿Continuar?`)) return;
        // POST cada cliente a la DB para obtener IDs reales
        let importados = 0;
        for (const cliente of nuevos) {
          try {
            const r = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cliente) });
            const d = await r.json();
            if (r.ok) { setClientes(prev => [...prev, d]); importados++; }
          } catch { /* skip */ }
        }
        setShowImportModal(false);
        showToast(`✅ ${importados} de ${nuevos.length} clientes importados`, 'success');
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
      import('jspdf-autotable').then(({ default: autoTable }) => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('CartaMaster - Reporte de Cartera', 14, 15);
        doc.setFontSize(10); doc.setFont(undefined, 'normal');
        doc.text(`Generado: ${new Date().toLocaleDateString('es-DO')} | Total clientes: ${clientes.length}`, 14, 22);
        autoTable(doc, {
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
      import('jspdf-autotable').then(({ default: autoTable }) => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('CartaMaster - Reporte de Créditos', 14, 15);
        doc.setFontSize(10); doc.setFont(undefined, 'normal');
        doc.text(`Generado: ${new Date().toLocaleDateString('es-DO')} | Total créditos: ${creditos.length}`, 14, 22);
        autoTable(doc, {
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

  // ─── DOCUMENTOS / COTIZACIONES ───────────────────────────
  const abrirDocsModal = (cliente) => { setDocsClienteId(cliente.id); setShowDocsModal(true); };

  // ── Extrae el monto "Total RD$" del contenido de un PDF (base64) ──
  const extraerMontoPDF = async (base64) => {
    try {
      const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const fd = new FormData();
      fd.append('pdf', blob, 'documento.pdf');
      const res = await fetch('/api/leer-pdf', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.monto != null) return data.monto;
      return null;
    } catch { return null; }
  };

  const subirDocumento = async (clienteId, file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { showToast('El archivo debe ser menor a 3MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      const montoDetectado = await extraerMontoPDF(base64);
      const nueva = { id: Date.now(), nombre: file.name, base64, fecha: new Date().toISOString(), monto: montoDetectado, tipo: 'subido', estado: 'Cotizado' };
      setCotizaciones(prev => ({ ...prev, [clienteId]: [...(prev[clienteId] || []), nueva] }));
      const clienteActual = clientes.find(c => c.id === clienteId);
      if (clienteActual) {
        const updates = { ...clienteActual, estado: 'Cotizado', fechaCotizacion: clienteActual.fechaCotizacion || new Date().toISOString().split('T')[0] };
        if (montoDetectado) updates.monto = montoDetectado.toString();
        actualizarCliente(updates);
      }
      if (montoDetectado) {
        showToast(`Documento guardado · Monto detectado: RD$${montoDetectado.toLocaleString('en-US')}`, 'success');
      } else {
        showToast('Documento guardado · Estado marcado como Cotizado', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const eliminarDocumento = (clienteId, docId) => {
    setCotizaciones(prev => ({ ...prev, [clienteId]: (prev[clienteId] || []).filter(d => d.id !== docId) }));
    showToast('Documento eliminado', 'info');
  };

  const actualizarEstadoCotizacion = (clienteId, docId, nuevoEstado) => {
    setCotizaciones(prev => ({
      ...prev,
      [clienteId]: (prev[clienteId] || []).map(d => d.id === docId ? { ...d, estado: nuevoEstado } : d)
    }));
  };

  const crearCotizacionManual = (clienteId, monto, estado = 'Cotizado') => {
    const nueva = { id: Date.now(), nombre: null, base64: null, fecha: new Date().toISOString(), monto: parseFloat(monto), tipo: 'manual', estado };
    setCotizaciones(prev => ({ ...prev, [clienteId]: [...(prev[clienteId] || []), nueva] }));
    showToast(`Cotización creada · RD$${parseFloat(monto).toLocaleString('en-US')} · ${estado}`, 'success');
  };

  // Sincroniza el estado de la cotización más reciente con el estado del cliente
  const sincronizarEstadoCotizacion = (clienteId, nuevoEstado) => {
    if (!['Cotizado','Notificado','Pagado','Facturado','Vencido'].includes(nuevoEstado)) return;
    setCotizaciones(prev => {
      const docs = prev[clienteId] || [];
      if (!docs.length) return prev;
      const ultimaId = docs.reduce((a, b) => (a.id > b.id ? a : b)).id;
      return { ...prev, [clienteId]: docs.map(d => d.id === ultimaId ? { ...d, estado: nuevoEstado } : d) };
    });
  };

  const descargarDocumento = (doc) => {
    const a = document.createElement('a');
    a.href = doc.base64;
    a.download = doc.nombre;
    a.click();
  };

  const abrirNotifDocModal = (cliente) => {
    const docs = cotizaciones[cliente.id] || [];
    if (docs.length === 0) { showToast('Este cliente no tiene documentos guardados', 'info'); return; }
    setNotifDocCliente(cliente);
    setNotifDocSeleccionado(docs[docs.length - 1]);
    setNotifDocMensaje(`Hola ${cliente.nombre}, le enviamos su cotización correspondiente.\n\nEstado de su cuenta: *${cliente.estado}*\nMonto: *$${(parseFloat(cliente.monto)||0).toLocaleString('en-US')}*\n\nAdjunto encontrará el documento. Quedamos atentos a cualquier consulta.\n\n— CartaMaster`);
    setShowNotifDocModal(true);
  };

  const enviarNotifConDocumento = () => {
    if (!notifDocCliente || !notifDocSeleccionado) return;
    descargarDocumento(notifDocSeleccionado);
    setTimeout(() => {
      const num = (notifDocCliente.contacto || '').replace(/\D/g, '');
      window.open(`https://wa.me/1${num}?text=${encodeURIComponent(notifDocMensaje)}`, '_blank');
      setShowNotifDocModal(false);
      showToast('WhatsApp abierto. Adjunta el PDF descargado al mensaje.', 'success');
    }, 800);
  };

  const abrirGenCotModal = (cliente) => {
    setGenCotCliente(cliente);
    setCotItems([{ descripcion: `Servicio — ${cliente.nombre}`, cantidad: 1, precio: parseFloat(cliente.monto) || '' }]);
    setCotNota('Precios sujetos a cambio sin previo aviso.');
    setCotValidez(30);
    setShowGenCotModal(true);
  };

  const agregarItemCot = () => setCotItems(prev => [...prev, { descripcion: '', cantidad: 1, precio: '' }]);
  const actualizarItemCot = (i, campo, val) => setCotItems(prev => prev.map((it, idx) => idx === i ? { ...it, [campo]: val } : it));
  const eliminarItemCot = (i) => setCotItems(prev => prev.filter((_, idx) => idx !== i));

  const generarCotizacionPDF = () => {
    if (!genCotCliente) return;
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const fecha = new Date();
        const numCot = `COT-${genCotCliente.id}-${fecha.getFullYear()}${String(fecha.getMonth()+1).padStart(2,'0')}${String(fecha.getDate()).padStart(2,'0')}`;
        // Cabecera
        doc.setFillColor(15,28,63); doc.rect(0,0,210,42,'F');
        doc.setTextColor(255,255,255); doc.setFontSize(22); doc.setFont(undefined,'bold');
        doc.text('CartaMaster', 15, 17);
        doc.setFontSize(10); doc.setFont(undefined,'normal');
        doc.text('Cotización de Servicios', 15, 26);
        doc.text(`Nº ${numCot}`, 15, 34);
        doc.text(`Fecha: ${fecha.toLocaleDateString('es-DO')}`, 135, 26);
        doc.text(`Válida por: ${cotValidez} días`, 135, 34);
        // Datos cliente
        doc.setTextColor(15,28,63); doc.setFontSize(11); doc.setFont(undefined,'bold');
        doc.text('Cotizado para:', 15, 56);
        doc.setFont(undefined,'normal'); doc.setFontSize(10);
        doc.text(`Cliente: ${genCotCliente.nombre}`, 15, 65);
        doc.text(`ID: ${genCotCliente.id}`, 15, 72);
        if (genCotCliente.contacto) doc.text(`Contacto: ${genCotCliente.contacto}`, 15, 79);
        // Tabla de items
        const subtotal = cotItems.reduce((s, it) => s + (parseFloat(it.precio)||0) * (parseFloat(it.cantidad)||1), 0);
        const itax = subtotal * 0.18;
        const total = subtotal + itax;
        autoTable(doc, {
          startY: 90,
          head: [['#', 'Descripción', 'Cant.', 'Precio Unit.', 'Total']],
          body: cotItems.map((it, i) => {
            const p = parseFloat(it.precio) || 0;
            const q = parseFloat(it.cantidad) || 1;
            return [i+1, it.descripcion, q, `$${p.toLocaleString('en-US',{minimumFractionDigits:2})}`, `$${(p*q).toLocaleString('en-US',{minimumFractionDigits:2})}`];
          }),
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [99,91,255], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248,250,252] },
          columnStyles: { 0:{cellWidth:10}, 2:{halign:'center'}, 3:{halign:'right'}, 4:{halign:'right',fontStyle:'bold'} },
          margin: { left: 15, right: 15 },
        });
        let y = doc.lastAutoTable.finalY + 5;
        // Totales
        const totales = [['Subtotal', `$${subtotal.toLocaleString('en-US',{minimumFractionDigits:2})}`], ['ITBIS (18%)', `$${itax.toLocaleString('en-US',{minimumFractionDigits:2})}`], ['TOTAL', `$${total.toLocaleString('en-US',{minimumFractionDigits:2})}`]];
        autoTable(doc, { startY: y, body: totales, styles: { fontSize: 9 }, columnStyles: { 0:{halign:'right',fontStyle:'bold',fillColor:[248,250,252]}, 1:{halign:'right',cellWidth:40} }, tableWidth: 100, margin: { left: 95 }, didParseCell: (d) => { if (d.row.index === 2) { d.cell.styles.fillColor = [15,28,63]; d.cell.styles.textColor = [255,255,255]; d.cell.styles.fontStyle = 'bold'; } } });
        // Nota
        if (cotNota) { y = doc.lastAutoTable.finalY + 8; doc.setFontSize(9); doc.setTextColor(100,116,139); doc.setFont(undefined,'italic'); doc.text(`Nota: ${cotNota}`, 15, y, { maxWidth: 180 }); }
        // Footer
        doc.setTextColor(148,163,184); doc.setFontSize(8); doc.setFont(undefined,'normal');
        doc.text('Este documento es una cotización y no constituye una factura.', 15, 282);
        doc.text(`Válida hasta: ${new Date(fecha.getTime() + cotValidez*86400000).toLocaleDateString('es-DO')}`, 15, 287);
        // Guardar en sistema Y descargar
        const pdfNombre = `cotizacion-${genCotCliente.nombre.replace(/ /g,'-')}-${numCot}.pdf`;
        const base64 = doc.output('datauristring');
        const nueva = { id: Date.now(), nombre: pdfNombre, base64, fecha: new Date().toISOString(), monto: total, tipo: 'generado', numCot };
        setCotizaciones(prev => ({ ...prev, [genCotCliente.id]: [...(prev[genCotCliente.id] || []), nueva] }));
        doc.save(pdfNombre);
        setShowGenCotModal(false);
        showToast(`Cotización ${numCot} generada y guardada`, 'success');
      });
    });
  };

  // ─── CARGA MASIVA ─────────────────────────────────────────
  const detectarClientePorArchivo = (nombreArchivo) => {
    const nombre = nombreArchivo.toLowerCase().replace(/\.(pdf)$/i, '').replace(/[-_]/g, ' ');
    // 1. Buscar por ID numérico en el nombre
    const numeros = nombreArchivo.match(/\d+/g) || [];
    for (const num of numeros) {
      const id = parseInt(num);
      const cliente = clientes.find(c => c.id === id);
      if (cliente) return { cliente, confianza: 'alta', razon: `ID ${id} encontrado en el nombre` };
    }
    // 2. Buscar por nombre del cliente (coincidencia completa)
    const match = clientes.find(c => nombre.includes(c.nombre.toLowerCase().replace(/[-_]/g, ' ')));
    if (match) return { cliente: match, confianza: 'alta', razon: `Nombre "${match.nombre}" en el archivo` };
    // 3. Buscar por primera palabra del nombre del cliente
    const matchParcial = clientes.find(c => {
      const palabras = c.nombre.toLowerCase().split(' ');
      return palabras.some(p => p.length > 3 && nombre.includes(p));
    });
    if (matchParcial) return { cliente: matchParcial, confianza: 'media', razon: `Coincidencia parcial con "${matchParcial.nombre}"` };
    return null;
  };

  const procesarArchivosMasivos = async (files) => {
    if (!files || files.length === 0) return;
    const validos = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (validos.length === 0) { showToast('Selecciona archivos PDF', 'error'); return; }
    if (validos.length > 50) { showToast('Máximo 50 archivos a la vez', 'error'); return; }
    setCargaMasivaProcesando(true);

    const leerArchivo = (file) => new Promise((resolve) => {
      if (file.size > 3 * 1024 * 1024) {
        resolve({ id: Date.now() + Math.random(), nombre: file.name, base64: null, clienteDetectado: detectarClientePorArchivo(file.name), clienteAsignado: null, estado: 'error', error: 'Archivo mayor a 3MB', montoDetectado: null });
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result;
        const deteccion = detectarClientePorArchivo(file.name);
        const montoDetectado = await extraerMontoPDF(base64);
        resolve({
          id: Date.now() + Math.random(),
          nombre: file.name,
          base64,
          clienteDetectado: deteccion,
          clienteAsignado: deteccion ? deteccion.cliente : null,
          estado: deteccion ? (deteccion.confianza === 'alta' ? 'vinculado' : 'sugerido') : 'sin-vincular',
          montoDetectado,
        });
      };
      reader.readAsDataURL(file);
    });

    const resultados = await Promise.all(validos.map(leerArchivo));
    resultados.sort((a, b) => { const orden = { vinculado: 0, sugerido: 1, 'sin-vincular': 2, error: 3 }; return orden[a.estado] - orden[b.estado]; });
    setArchivosEnProceso(resultados);
    setCargaMasivaProcesando(false);
  };

  const confirmarCargaMasiva = () => {
    let guardados = 0; let errores = 0;
    archivosEnProceso.forEach(arch => {
      if (!arch.base64 || !arch.clienteAsignado) { errores++; return; }
      const nueva = { id: Date.now() + Math.random(), nombre: arch.nombre, base64: arch.base64, fecha: new Date().toISOString(), monto: arch.montoDetectado || null, tipo: 'subido', estado: 'Cotizado' };
      setCotizaciones(prev => ({ ...prev, [arch.clienteAsignado.id]: [...(prev[arch.clienteAsignado.id] || []), nueva] }));
      if (arch.montoDetectado) {
        const clienteActual = clientes.find(c => c.id === arch.clienteAsignado.id);
        if (clienteActual) actualizarCliente({ ...clienteActual, monto: arch.montoDetectado.toString() });
      }
      guardados++;
    });
    setShowCargaMasivaModal(false);
    setArchivosEnProceso([]);
    const msg = [
      `${guardados} documento${guardados !== 1 ? 's' : ''} guardado${guardados !== 1 ? 's' : ''}`,
      errores > 0 ? `${errores} sin vincular omitidos` : null,
    ].filter(Boolean).join(' · ');
    showToast(msg, guardados > 0 ? 'success' : 'error');
  };

  // ─── GESTIÓN DE USUARIOS ─────────────────────────────────
  const validarPassUI = (p) => {
    if (!p) return null; // vacío es permitido al editar (no cambia pass)
    if (p.length < 8) return 'Mínimo 8 caracteres';
    if (!/[A-Z]/.test(p)) return 'Debe contener al menos 1 mayúscula';
    if (!/[0-9]/.test(p)) return 'Debe contener al menos 1 número';
    return null;
  };

  const guardarUsuario = async () => {
    const { username: uname, nombre, pass, rol } = usuarioForm;
    const isNuevo = !usuarioEditando;
    if (!uname.trim()) return;
    if (isNuevo && !pass) { showToast('La contraseña es requerida', 'error'); return; }
    const passErr = validarPassUI(pass);
    if (passErr) { showToast(passErr, 'error'); return; }
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, nombre, pass, rol }),
    });
    const data = await res.json();
    if (res.ok) {
      await cargarUsuarios();
      setUsuarioForm({ username: '', nombre: '', pass: '', rol: 'viewer' });
      setUsuarioEditando(null);
      showToast(`Usuario ${data.username} ${usuarioEditando ? 'actualizado' : 'creado'}`, 'success');
    } else {
      showToast(data.error || 'Error al guardar usuario', 'error');
    }
  };
  const eliminarUsuario = async (key) => {
    const res = await fetch('/api/usuarios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: key, currentUser }),
    });
    const data = await res.json();
    if (res.ok) { await cargarUsuarios(); showToast(`Usuario ${key} eliminado`, 'info'); }
    else showToast(data.error || 'Error al eliminar', 'error');
  };
  const editarUsuario = (key) => {
    setUsuarioEditando(key);
    setUsuarioForm({ username: key, nombre: usuarios[key]?.nombre || '', pass: '', rol: usuarios[key]?.rol || 'viewer' });
  };

  const abrirAuditLog = async () => {
    setShowAuditModal(true);
    setAuditLoading(true);
    setAuditFilter('');
    try {
      const res  = await fetch('/api/audit?lines=300');
      const data = await res.json();
      setAuditEntries(data.entries || []);
    } catch { setAuditEntries([]); }
    setAuditLoading(false);
  };

  // ─── BITÁCORA DE GESTIONES ───────────────────────────────
  const TIPOS_GESTION = ['Llamada', 'WhatsApp', 'Visita', 'Email', 'Otro'];
  const RESULTADOS_GESTION = ['Contestó', 'No Contestó', 'Buzón de Voz', 'Promesa de Pago', 'Pago Recibido', 'Rechazó', 'Sin Respuesta'];
  const COLOR_RESULTADO = { 'Contestó':'#059669','No Contestó':'#dc2626','Buzón de Voz':'#6b7280','Promesa de Pago':'#d97706','Pago Recibido':'#16a34a','Rechazó':'#dc2626','Sin Respuesta':'#9ca3af' };

  const abrirGestionModal = (cliente) => {
    setGestionClienteId(cliente.id);
    setGestionTipo('Llamada'); setGestionResultado('Contestó');
    setGestionNota(''); setGestionProximaFecha('');
    setShowGestionModal(true);
  };
  const guardarGestion = () => {
    if (!gestionClienteId) return;
    const nueva = { id: Date.now(), fecha: new Date().toISOString(), tipo: gestionTipo, resultado: gestionResultado, nota: gestionNota, proximaFecha: gestionProximaFecha, usuario: currentUser || 'CPEREZ' };
    setGestiones(prev => ({ ...prev, [gestionClienteId]: [nueva, ...(prev[gestionClienteId] || [])] }));
    setShowGestionModal(false);
    showToast(`Gestión registrada: ${gestionResultado}`, 'success');
  };
  const ultimaGestion = (clienteId) => (gestiones[clienteId] || [])[0] || null;
  const tieneProximoSeguimiento = (clienteId) => {
    const g = ultimaGestion(clienteId);
    if (!g || !g.proximaFecha) return false;
    return new Date(g.proximaFecha) <= new Date(new Date().setHours(23,59,59,999));
  };

  // ─── PLANTILLAS WHATSAPP ──────────────────────────────────
  const aplicarPlantilla = (texto, cliente) => texto
    .replace(/{nombre}/g, cliente.nombre)
    .replace(/{monto}/g, (parseFloat(cliente.monto)||0).toLocaleString('en-US'))
    .replace(/{estado}/g, cliente.estado)
    .replace(/{id}/g, cliente.id);

  const guardarPlantilla = () => {
    if (!plantillaForm.nombre.trim() || !plantillaForm.texto.trim()) return;
    if (plantillaEditando) {
      setPlantillas(prev => prev.map(p => p.id === plantillaEditando ? { ...p, ...plantillaForm } : p));
    } else {
      setPlantillas(prev => [...prev, { id: Date.now(), ...plantillaForm }]);
    }
    setPlantillaEditando(null); setPlantillaForm({ nombre: '', texto: '' });
    showToast('Plantilla guardada', 'success');
  };
  const eliminarPlantilla = (id) => setPlantillas(prev => prev.filter(p => p.id !== id));

  // ─── WHATSAPP MASIVO ──────────────────────────────────────
  const toggleSeleccion = (id) => setClientesSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleTodos = () => setClientesSeleccionados(prev => prev.length === clientesPaginados.length ? [] : clientesPaginados.map(c => c.id));

  const iniciarWaMasivo = () => {
    if (clientesSeleccionados.length === 0) { showToast('Selecciona al menos un cliente', 'error'); return; }
    setWaMasivoMensaje(''); setWaMasivoIndex(0); setWaMasivoActivo(false);
    setShowWaMasivoModal(true);
  };
  const enviarWaMasivo = () => {
    const destinos = clientes.filter(c => clientesSeleccionados.includes(c.id) && c.contacto);
    if (destinos.length === 0) { showToast('Los clientes seleccionados no tienen contacto', 'error'); return; }
    setWaMasivoActivo(true); setWaMasivoIndex(0);
    const enviarUno = (i) => {
      if (i >= destinos.length) { showToast(`${destinos.length} WhatsApp abiertos`, 'success'); setWaMasivoActivo(false); setShowWaMasivoModal(false); setClientesSeleccionados([]); return; }
      const c = destinos[i];
      const msg = aplicarPlantilla(waMasivoMensaje, c);
      const num = c.contacto.replace(/\D/g,'');
      window.open(`https://wa.me/1${num}?text=${encodeURIComponent(msg)}`, '_blank');
      setWaMasivoIndex(i + 1);
      setTimeout(() => enviarUno(i + 1), 1500);
    };
    enviarUno(0);
  };

  // ─── ESTADO DE CUENTA PDF ─────────────────────────────────
  const generarEstadoCuentaPDF = (cliente) => {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const s = calcularSaldoCliente(cliente);
        // Header
        doc.setFillColor(15,28,63); doc.rect(0,0,210,40,'F');
        doc.setTextColor(255,255,255); doc.setFontSize(20); doc.setFont(undefined,'bold');
        doc.text('CartaMaster', 15, 16);
        doc.setFontSize(10); doc.setFont(undefined,'normal');
        doc.text('Estado de Cuenta', 15, 25);
        doc.text(`Generado: ${new Date().toLocaleDateString('es-DO')}`, 15, 33);
        // Cliente info
        doc.setTextColor(15,28,63); doc.setFontSize(13); doc.setFont(undefined,'bold');
        doc.text('Información del Cliente', 15, 55);
        autoTable(doc, { startY: 60, body: [
          ['Nombre', cliente.nombre], ['ID', cliente.id],
          ['Estado', cliente.estado], ['Teléfono', cliente.contacto || 'N/A'],
          ['Monto Total', `RD$${(s.monto).toLocaleString('en-US',{minimumFractionDigits:2})}`],
          ['Total Pagado', `RD$${(s.pagado).toLocaleString('en-US',{minimumFractionDigits:2})}`],
          ['Saldo Pendiente', `RD$${(s.pendiente).toLocaleString('en-US',{minimumFractionDigits:2})}`],
        ], styles:{fontSize:9,cellPadding:3}, columnStyles:{0:{fontStyle:'bold',cellWidth:50}}, margin:{left:15,right:15} });
        // Historial de pagos
        let y = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.text('Historial de Pagos', 15, y);
        const pagos = (cliente.pagosRealizados || []).map(p => [
          new Date(p.fecha).toLocaleDateString('es-DO'), `RD$${parseFloat(p.monto).toLocaleString('en-US',{minimumFractionDigits:2})}`, p.nota || '-'
        ]);
        autoTable(doc, { startY: y+5, head:[['Fecha','Monto','Nota']], body: pagos.length ? pagos : [['Sin pagos registrados','','']], styles:{fontSize:9}, headStyles:{fillColor:[99,91,255],textColor:255}, margin:{left:15,right:15} });
        // Gestiones
        const gest = (gestiones[cliente.id] || []).slice(0,10).map(g => [
          new Date(g.fecha).toLocaleDateString('es-DO'), g.tipo, g.resultado, g.nota || '-'
        ]);
        if (gest.length > 0) {
          y = doc.lastAutoTable.finalY + 10;
          doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.text('Bitácora de Gestiones', 15, y);
          autoTable(doc, { startY: y+5, head:[['Fecha','Tipo','Resultado','Nota']], body: gest, styles:{fontSize:8}, headStyles:{fillColor:[15,28,63],textColor:255}, margin:{left:15,right:15} });
        }
        doc.save(`estado-cuenta-${cliente.nombre.replace(/\s/g,'-')}.pdf`);
        showToast('Estado de cuenta generado', 'success');
      });
    });
  };

  // ─── AVATAR helper ───────────────────────────────────────
  const AVATAR_COLORS = ['#635bff','#f97316','#059669','#0284c7','#dc2626','#8b5cf6','#14b8a6','#f59e0b','#e11d48','#0891b2'];
  const getAvatar = (nombre) => {
    const idx = (nombre || '?').charCodeAt(0) % AVATAR_COLORS.length;
    return { letra: (nombre || '?')[0].toUpperCase(), color: AVATAR_COLORS[idx] };
  };

  // ─── TAGS ─────────────────────────────────────────────────
  const TAG_PREDEFINIDOS = ['VIP', 'Prioritario', 'Nuevo', 'Problema', 'Regular'];
  const TAG_CLASSES = { 'VIP': 'vip', 'Prioritario': 'prioritario', 'Nuevo': 'nuevo', 'Problema': 'problema' };
  const agregarTag = (clienteId, tag) => {
    if (!tag.trim()) return;
    const actuales = tags[clienteId] || [];
    if (actuales.includes(tag)) return;
    setTags(t => ({ ...t, [clienteId]: [...actuales, tag.trim()] }));
  };
  const eliminarTag = (clienteId, tag) => {
    setTags(t => ({ ...t, [clienteId]: (t[clienteId] || []).filter(x => x !== tag) }));
  };

  // ─── RESUMEN EJECUTIVO PDF ────────────────────────────────
  const generarResumenPDF = () => {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const mesNombre = obtenerNombreMes(mesVisualizando);
        // Header
        doc.setFillColor(15, 28, 63); doc.rect(0, 0, 210, 45, 'F');
        doc.setTextColor(255,255,255); doc.setFontSize(22); doc.setFont(undefined,'bold');
        doc.text('CartaMaster', 15, 18);
        doc.setFontSize(11); doc.setFont(undefined,'normal');
        doc.text('Resumen Ejecutivo Mensual', 15, 27);
        doc.text(mesNombre, 15, 35);
        doc.text(`Generado: ${new Date().toLocaleDateString('es-DO')}`, 120, 35);
        // KPIs
        doc.setTextColor(15,28,63); doc.setFontSize(13); doc.setFont(undefined,'bold');
        doc.text('Indicadores Clave', 15, 58);
        const kpis = [
          ['Total Clientes', estadisticas.total],
          ['Pagados', `${estadisticas.pagado} (${estadisticas.pagadoPct}%)`],
          ['Facturados', `${estadisticas.facturado} (${estadisticas.facturadoPct}%)`],
          ['Vencidos', `${estadisticas.vencido} (${estadisticas.vencidoPct}%)`],
          ['Cotizados', estadisticas.cotizado],
          ['Notificados', estadisticas.notificado],
        ];
        autoTable(doc, { startY: 63, head: [['Indicador','Valor']], body: kpis, styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [99,91,255], textColor: 255 }, columnStyles: { 0: { fontStyle:'bold' } }, margin: { left: 15, right: 15 } });
        // Montos
        let y = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.text('Resumen Financiero', 15, y);
        const montos = [
          ['Monto Cotizado', `$${(estadisticas.montoCotizado||0).toLocaleString('en-US')}`],
          ['Monto Notificado', `$${(estadisticas.montoNotificado||0).toLocaleString('en-US')}`],
          ['Monto Pagado', `$${(estadisticas.montoPagado||0).toLocaleString('en-US')}`],
          ['Monto Facturado', `$${(estadisticas.montoFacturado||0).toLocaleString('en-US')}`],
          ['Monto Vencido', `$${(estadisticas.montoVencido||0).toLocaleString('en-US')}`],
        ];
        autoTable(doc, { startY: y+5, head: [['Concepto','Monto']], body: montos, styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [15,28,63], textColor: 255 }, columnStyles: { 1: { fontStyle:'bold', halign:'right' } }, margin: { left: 15, right: 15 } });
        // Créditos
        y = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.text('Créditos', 15, y);
        const creditData = [
          ['Activos', creditoStats.activo], ['Por Vencer', creditoStats.porVencer],
          ['Vencidos', creditoStats.vencido], ['Pagados', creditoStats.pagado],
          ['Monto Total Activo', `$${creditoStats.totalMonto.toLocaleString('en-US',{minimumFractionDigits:2})}`],
        ];
        autoTable(doc, { startY: y+5, head: [['Estado','Cantidad/Monto']], body: creditData, styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [99,91,255], textColor: 255 }, margin: { left: 15, right: 15 } });
        // Clientes vencidos
        const vencidos = clientes.filter(c => c.estado === 'Vencido');
        if (vencidos.length > 0) {
          y = doc.lastAutoTable.finalY + 8;
          if (y > 240) { doc.addPage(); y = 20; }
          doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.text('Clientes Vencidos', 15, y);
          autoTable(doc, { startY: y+5, head: [['ID','Nombre','Monto','Contacto']], body: vencidos.map(c => [c.id, c.nombre, `$${(parseFloat(c.monto)||0).toLocaleString('en-US')}`, c.contacto||'-']), styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [239,68,68], textColor: 255 }, margin: { left: 15, right: 15 } });
        }
        // Footer
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          doc.setTextColor(148,163,184); doc.setFontSize(8); doc.setFont(undefined,'normal');
          doc.text('CartaMaster — Reporte Confidencial', 15, 287);
          doc.text(`Página ${i} de ${totalPages}`, 170, 287);
        }
        doc.save(`resumen-ejecutivo-${mesVisualizando}.pdf`);
        showToast('Resumen ejecutivo generado', 'success');
      });
    });
  };

  if (!hydrated || sessionStatus === 'loading') return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f0f3f8', fontSize: '1.1rem', color: '#64748b' }}>Cargando...</div>;

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
      {/* TOPBAR — ESPN style */}
      <div className="topbar">
        <div className="topbar-left">
          <button className="hamburger-btn" onClick={() => setShowMobileMenu(v => !v)} title="Menú">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {showMobileMenu
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>
              }
            </svg>
          </button>
          <div className="topbar-logo">
            <div className="dot">CM</div>
            <span className="logo-text">CartaMaster</span>
          </div>
          <nav className="topbar-center-nav">
            <button className={`topbar-nav-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Inicio</button>
            <button className={`topbar-nav-link ${activeTab === 'cartera' ? 'active' : ''}`} onClick={() => setActiveTab('cartera')}>Cartera</button>
            <button className={`topbar-nav-link ${activeTab === 'credito' ? 'active' : ''}`} onClick={() => setActiveTab('credito')}>Crédito</button>
            <button className={`topbar-nav-link ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}>Agenda</button>
            <button className={`topbar-nav-link ${activeTab === 'documentos' ? 'active' : ''}`} onClick={() => setActiveTab('documentos')}>Documentos</button>
            <button className={`topbar-nav-link ${activeTab === 'calendario' ? 'active' : ''}`} onClick={() => setActiveTab('calendario')}>Calendario</button>
            {puedeVerTodo && <button className={`topbar-nav-link ${activeTab === 'carteras' ? 'active' : ''}`} onClick={() => setActiveTab('carteras')}>Carteras</button>}
            {(esAdmin || esEditor) && <button className={`topbar-nav-link ${activeTab === 'delegations' ? 'active' : ''}`} onClick={() => { setActiveTab('delegations'); cargarDelegations(); }} style={{ position: 'relative' }}>Delegations{delegationsPendientes.length > 0 && <span style={{ position: 'absolute', top: '-2px', right: '-6px', width: '8px', height: '8px', background: '#f97316', borderRadius: '50%' }}></span>}</button>}
          </nav>
        </div>
        <div className="topbar-right">
          {soloLectura && <span style={{ background: 'rgba(254,249,195,0.15)', color: '#fbbf24', fontSize: '0.67rem', padding: '0.2rem 0.55rem', borderRadius: '5px', fontWeight: 700, marginRight: '0.25rem', border: '1px solid rgba(251,191,36,0.25)' }}>Solo lectura</span>}
          <button className="topbar-icon-btn" onClick={() => setShowBusquedaGlobal(true)} title="Buscar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button className="topbar-icon-btn" onClick={() => setDarkMode(!darkMode)} title="Modo oscuro">
            {darkMode
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          {esAdmin && (
            <button className="topbar-icon-btn" onClick={abrirAuditLog} title="Auditoría">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </button>
          )}
          {/* CAMPANA DE NOTIFICACIONES */}
          <div style={{ position: 'relative' }}>
            <button className="topbar-icon-btn" onClick={() => setShowNotifPanel(v => !v)} title="Notificaciones" style={{ position: 'relative' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {(estadisticas.vencido > 0 || esDespuesDel15) && (
                <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', display: 'block' }} />
              )}
            </button>
            {showNotifPanel && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowNotifPanel(false)} />
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: '300px', background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 999, overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 700, fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)' }}>
                    🔔 Notificaciones
                  </div>
                  {estadisticas.vencido > 0 ? (
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                        <span style={{ background: '#ef4444', borderRadius: '6px', padding: '0.15rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'white' }}>VENCIDOS</span>
                        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>{estadisticas.vencido} cliente(s)</span>
                      </div>
                      {clientes.filter(c => c.estado === 'Vencido').slice(0, 4).map(c => (
                        <div key={c.id} onClick={() => { setActiveTab('cartera'); setShowNotifPanel(false); }} style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', padding: '0.2rem 0', cursor: 'pointer', borderLeft: '2px solid #ef4444', paddingLeft: '0.5rem', marginBottom: '0.2rem' }}>
                          {c.nombre} {c.monto ? <span style={{ color: '#ef4444', fontWeight: 600 }}>· ${parseFloat(c.monto).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span> : ''}
                        </div>
                      ))}
                      {estadisticas.vencido > 4 && <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.2rem' }}>+{estadisticas.vencido - 4} más...</div>}
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>✅ Sin clientes vencidos</div>
                  )}
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ background: esDespuesDel15 ? 'rgba(249,115,22,0.2)' : 'rgba(100,116,139,0.2)', borderRadius: '6px', padding: '0.15rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: esDespuesDel15 ? '#fb923c' : '#94a3b8' }}>CORTE</span>
                    <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                      {esDespuesDel15 ? '⚠️ Ya pasó el día 15 de este mes' : `Día 15 de cada mes · Faltan ${15 - new Date().getDate()} días`}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showMobileMenu && <div className="mobile-overlay" onClick={() => setShowMobileMenu(false)} />}
      <div className="main-layout">
        {/* SIDEBAR */}
        <div className={`sidebar${showMobileMenu ? ' mobile-open' : ''}`}>
          <div className="sidebar-section">
            <div className="sidebar-label">Gestión</div>
            <div className={`sidebar-item ${activeTab === 'cartera' ? 'active' : ''}`} onClick={() => setActiveTab('cartera')}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg></span> Cartera</div>
            <div className={`sidebar-item ${activeTab === 'credito' ? 'active' : ''}`} onClick={() => setActiveTab('credito')}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span> Crédito</div>
            <div className={`sidebar-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span> Agenda del Día</div>
            <div className={`sidebar-item ${activeTab === 'documentos' ? 'active' : ''}`} onClick={() => setActiveTab('documentos')}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span> Documentos</div>
            {puedeVerTodo && <div className={`sidebar-item ${activeTab === 'carteras' ? 'active' : ''}`} onClick={() => setActiveTab('carteras')}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span> Carteras por Agente</div>}
            {(esAdmin || esEditor) && <div className={`sidebar-item ${activeTab === 'delegations' ? 'active' : ''}`} onClick={() => { setActiveTab('delegations'); cargarDelegations(); }} style={{ position: 'relative' }}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></span> Delegations{delegationsPendientes.length > 0 && <span style={{ position: 'absolute', top: '6px', right: '8px', width: '8px', height: '8px', background: '#f97316', borderRadius: '50%' }}></span>}</div>}
            <div className="sidebar-item" onClick={() => { setArchivosEnProceso([]); setShowCargaMasivaModal(true); }}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span> Carga Masiva PDF</div>
            <div className="sidebar-item" onClick={() => setShowPlantillasModal(true)}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> Plantillas WA</div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }} onClick={() => setShowExportMenu(v => !v)}>
              <span>Exportar</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showExportMenu ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {showExportMenu && (<>
            <div className="sidebar-item" onClick={exportarTodosExcel}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span> Excel — Todos</div>
            <div className="sidebar-item" onClick={exportarNoGeneraron}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span> No Generaron</div>
            <div className="sidebar-item" onClick={exportarFacturados}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span> Facturados</div>
            <div className="sidebar-item" onClick={exportarPDF}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span> PDF — Cartera</div>
            <div className="sidebar-item" onClick={generarResumenPDF}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span> Resumen PDF</div>
            <div className="sidebar-item" onClick={backupJSON}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span> Backup JSON</div>
            <div className="sidebar-item" onClick={() => setShowImportModal(true)}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span> Importar Excel</div>
            </>)}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Período</div>
            <div style={{ padding: '0 0.65rem' }}>
              <select value={mesVisualizando} onChange={(e) => setMesVisualizando(e.target.value)} style={{ width: '100%', padding: '0.45rem 0.6rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', marginBottom: '0.45rem' }}>
                {obtenerMesesDisponibles().map(mes => <option key={mes} value={mes}>{obtenerNombreMes(mes)}{mes === obtenerMesActual() ? ' (Actual)' : ''}</option>)}
              </select>
              {!esModoPasado ? (
                <button onClick={() => setShowDescargaMesModal(true)} style={{ width: '100%', padding: '0.45rem', background: 'rgba(249,115,22,0.15)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '7px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>Guardar Mes</button>
              ) : (
                <div style={{ padding: '0.35rem 0.6rem', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.18)', borderRadius: '6px', fontSize: '0.73rem', fontWeight: 600, color: 'rgba(249,115,22,0.7)', textAlign: 'center' }}>Solo Lectura</div>
              )}
            </div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Sistema</div>
            <div className="sidebar-item" onClick={exportarDatos}><span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span> Exportar JSON</div>
            <label className="sidebar-item" style={{ cursor: 'pointer' }}>
              <span className="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span> Importar JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => { try { const datos = JSON.parse(ev.target.result); if (datos.clientes) setClientes(datos.clientes); if (datos.creditos) setCreditos(datos.creditos); showToast('Datos importados correctamente', 'success'); } catch { showToast('Error al importar el archivo', 'error'); } };
                reader.readAsText(file);
              }} />
            </label>
          </div>

          {/* ── User footer — Claude style ── */}
          <div className="sidebar-user-footer">
            <div className="sidebar-user-avatar">
              {(currentUser || session?.user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{currentUser || session?.user?.name || 'Usuario'}</div>
              <div className="sidebar-user-role">{esAdmin ? 'Administrador' : esEditor ? 'Editor' : 'Viewer'}</div>
            </div>
            <div className="sidebar-user-actions">
              <button className="sidebar-icon-btn" onClick={() => { setSettingsSection('config'); setShowSettingsPanel(true); }} title="Configuración">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
              <button className="sidebar-icon-btn" onClick={() => { window._manualLogout = true; signOut({ callbackUrl: "/" }); setTimeout(() => { window.location.href = "/"; }, 500); }} title="Cerrar sesión">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="content-area">
          <div className="page-header" style={{ flexDirection:'column', alignItems:'stretch', gap:'1rem', padding:'1.25rem 1.5rem', background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', marginBottom:'0.5rem' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h1 style={{ margin:0, fontSize:'1.3rem', fontWeight:700 }}>Bienvenido, {session?.user?.name || currentUser || 'Usuario'}</h1>
                <p style={{ margin:'0.15rem 0 0', fontSize:'0.78rem', color:'var(--text-muted)' }}>Gestión de Cartera · {new Date().toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'20px', padding:'0.25rem 0.75rem', fontWeight:600 }}>Corte · día 15</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'0.75rem' }}>
              <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', marginBottom:'0.3rem' }}>Por Cobrar</div>
                <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#ea580c', fontFamily:'var(--mono)' }}>${{((estadisticas.montoCotizado||0) + (estadisticas.montoNotificado||0)).toLocaleString('en-US', { maximumFractionDigits:0 })}}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{(estadisticas.cotizado||0) + (estadisticas.notificado||0)} clientes pendientes</div>
              </div>
              <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', marginBottom:'0.3rem' }}>Cobrado este mes</div>
                <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#059669', fontFamily:'var(--mono)' }}>${{(estadisticas.montoPagado||0).toLocaleString('en-US', { maximumFractionDigits:0 })}}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{estadisticas.pagado||0} clientes pagados</div>
              </div>
              <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.75rem 1rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.3rem' }}>
                  <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)' }}>Meta mensual</div>
                  <div style={{ fontSize:'0.7rem', fontWeight:700, color: metaMensual > 0 && (estadisticas.montoPagado||0) >= metaMensual ? '#059669' : 'var(--text-muted)' }}>{metaMensual > 0 ? `${{Math.min(100, Math.round(((estadisticas.montoPagado||0) / metaMensual) * 100))}}%` : '—'}</div>
                </div>
                <div style={{ fontSize:'1.25rem', fontWeight:800, color:'var(--brand)', fontFamily:'var(--mono)' }}>${{(metaMensual||0).toLocaleString('en-US', { maximumFractionDigits:0 })}}</div>
                {metaMensual > 0 && (<div style={{ marginTop:'0.5rem' }}><div style={{ height:'4px', borderRadius:'99px', background:'var(--border)', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'99px', background: (estadisticas.montoPagado||0) >= metaMensual ? '#059669' : 'var(--brand)', width:`${{Math.min(100, ((estadisticas.montoPagado||0) / metaMensual) * 100)}}%`, transition:'width 0.5s ease' }}></div></div></div>)}
                {!metaMensual && <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>Configura en Preferencias</div>}
              </div>
            </div>
          </div>

          </div>

          <div className="tabs-nav">
            <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Inicio</button>
            <button className={`tab-btn ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')} style={{ position:'relative' }}>
              Agenda
              {(() => { const hoy = clientes.filter(c => tieneProximoSeguimiento(c.id)).length; return hoy > 0 ? <span style={{ position:'absolute', top:'6px', right:'2px', background:'#dc2626', color:'white', borderRadius:'50%', width:'16px', height:'16px', fontSize:'0.6rem', fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>{hoy}</span> : null; })()}
            </button>
            <button className={`tab-btn ${activeTab === 'cartera' ? 'active' : ''}`} onClick={() => setActiveTab('cartera')}>Cartera</button>
            <button className={`tab-btn ${activeTab === 'credito' ? 'active' : ''}`} onClick={() => setActiveTab('credito')}>Crédito</button>
            <button className={`tab-btn ${activeTab === 'documentos' ? 'active' : ''}`} onClick={() => setActiveTab('documentos')}>Documentos</button>
            <button className={`tab-btn ${activeTab === 'calendario' ? 'active' : ''}`} onClick={() => setActiveTab('calendario')}>Calendario</button>
            {puedeVerTodo && <button className={`tab-btn ${activeTab === 'carteras' ? 'active' : ''}`} onClick={() => setActiveTab('carteras')}>Carteras</button>}
            {(esAdmin || esEditor) && <button className={`tab-btn ${activeTab === 'delegations' ? 'active' : ''}`} onClick={() => { setActiveTab('delegations'); cargarDelegations(); }}>Delegations</button>}
          </div>

          {/* TAB DASHBOARD */}
          <div className={`tab-content ${activeTab === 'dashboard' ? 'active' : ''}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Total Clientes', value: clientes.length, color: '#0284c7' },
                { label: 'Cobrado este mes', value: `$${(estadisticas.montoPagado||0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: '#059669' },
                { label: 'Clientes Vencidos', value: estadisticas.vencido, color: '#dc2626' },
                { label: 'Créditos Activos', value: creditoStats.activo + creditoStats.porVencer, color: '#7c3aed' },
                { label: 'Por Cobrar', value: `$${(estadisticas.montoCotizado + estadisticas.montoNotificado||0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, color: '#ea580c' },
                { label: 'Créditos Vencidos', value: creditoStats.vencido, color: '#dc2626' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.25rem 1.4rem', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,22,37,0.04)' }}>
                  <div style={{ width: '3px', position: 'absolute', left: 0, top: '18%', bottom: '18%', background: s.color, borderRadius: '0 2px 2px 0' }}></div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.45rem' }}>{s.label}</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: 1, letterSpacing: '-0.03em' }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>Créditos por Vencer — 7 días</div>
                {creditosAlerta.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No hay créditos próximos a vencer.</p> :
                  creditosAlerta.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div><strong>{c.cliente}</strong><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Orden: {c.numeroOrden}</div></div>
                    <span className={`dias-restantes ${getDiasRestantes(c.fechaVencimiento) <= 3 ? 'critico' : 'advertencia'}`}>{getDiasRestantes(c.fechaVencimiento)} días</span>
                  </div>)}
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>Últimos clientes agregados</div>
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

            {/* Meta Mensual */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)' }}>🎯 Meta de Cobros del Mes</div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="number" value={metaMensual || ''} onChange={e => setMetaMensual(parseFloat(e.target.value) || 0)} placeholder="Meta ($)" style={{ width: '120px', padding: '0.35rem 0.6rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--mono)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>meta mensual</span>
                </div>
              </div>
              {metaMensual > 0 ? (() => {
                const cobrado = estadisticas.montoPagado || 0;
                const pct = Math.min((cobrado / metaMensual) * 100, 100);
                const claseBar = pct >= 100 ? 'success' : pct >= 60 ? '' : pct >= 30 ? 'warning' : 'danger';
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Cobrado: <strong style={{ color: '#059669', fontFamily: 'var(--mono)' }}>${cobrado.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></span>
                      <span style={{ color: 'var(--text-muted)' }}>Meta: <strong style={{ fontFamily: 'var(--mono)' }}>${metaMensual.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></span>
                      <strong style={{ color: pct >= 100 ? '#059669' : pct >= 60 ? 'var(--accent)' : '#dc2626', fontFamily: 'var(--mono)' }}>{pct.toFixed(1)}%</strong>
                    </div>
                    <div className="meta-bar"><div className={`meta-bar-fill ${claseBar}`} style={{ width: `${pct}%` }}></div></div>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {pct >= 100 ? '🎉 ¡Meta alcanzada!' : `Faltan $${(metaMensual - cobrado).toLocaleString('en-US', { maximumFractionDigits: 0 })} para la meta`}
                    </div>
                  </div>
                );
              })() : <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Ingresa una meta en el campo de arriba para ver tu progreso.</div>}
            </div>

            {/* Comparativa mes a mes */}
            {Object.keys(historialMeses).length > 0 && (() => {
              const meses = Object.keys(historialMeses).sort().slice(-4);
              const maxMonto = Math.max(...meses.map(m => (historialMeses[m]?.clientes || []).filter(c => c.estado === 'Pagado').reduce((s, c) => s + (parseFloat(c.monto)||0), 0)), estadisticas.montoPagado || 1);
              return (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>📈 Comparativa de Cobros (últimos meses)</div>
                  <div className="comparativa-bar">
                    {meses.map(m => {
                      const cobrado = (historialMeses[m]?.clientes || []).filter(c => c.estado === 'Pagado').reduce((s, c) => s + (parseFloat(c.monto)||0), 0);
                      const pct = maxMonto > 0 ? (cobrado / maxMonto) * 100 : 0;
                      return (
                        <div key={m} className="comp-row">
                          <div className="comp-label">{m.slice(5)}/{m.slice(2,4)}</div>
                          <div className="comp-track">
                            <div className="comp-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #635bff, #818cf8)' }}>${cobrado > 0 ? (cobrado/1000).toFixed(1)+'k' : '0'}</div>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', width: '60px', flexShrink: 0 }}>${cobrado.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                        </div>
                      );
                    })}
                    {/* Mes actual */}
                    {(() => {
                      const cobrado = estadisticas.montoPagado || 0;
                      const pct = maxMonto > 0 ? Math.min((cobrado / maxMonto) * 100, 100) : 0;
                      const mesActual = obtenerMesActual();
                      return (
                        <div className="comp-row">
                          <div className="comp-label" style={{ color: 'var(--accent)', fontWeight: 800 }}>{mesActual.slice(5)}/{mesActual.slice(2,4)} ★</div>
                          <div className="comp-track">
                            <div className="comp-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #059669, #4ade80)' }}>${cobrado > 0 ? (cobrado/1000).toFixed(1)+'k' : '0'}</div>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#059669', fontFamily: 'var(--mono)', width: '60px', flexShrink: 0, fontWeight: 700 }}>${cobrado.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}

            {/* Feed de actividad reciente */}
            {(() => {
              const eventos = [];
              clientes.forEach(c => {
                (c.historial || []).forEach(h => eventos.push({ fecha: h.fecha, texto: h.accion, cliente: c.nombre, tipo: h.accion.toLowerCase().includes('pago') ? 'success' : h.accion.toLowerCase().includes('vencid') ? 'danger' : h.accion.toLowerCase().includes('suspendid') ? 'danger' : 'default' }));
                (c.pagosRealizados || []).forEach(p => eventos.push({ fecha: p.fecha, texto: `Pago de $${parseFloat(p.monto).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, cliente: c.nombre, tipo: 'success' }));
              });
              eventos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
              const recientes = eventos.slice(0, 12);
              if (recientes.length === 0) return null;
              return (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>⚡ Actividad Reciente</div>
                  <div className="timeline" style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {recientes.map((ev, i) => (
                      <div key={i} className="timeline-item">
                        <div className={`timeline-dot ${ev.tipo}`}></div>
                        <div className="timeline-body">
                          <div className="timeline-title"><strong>{ev.cliente}</strong> — {ev.texto}</div>
                          <div className="timeline-meta">{new Date(ev.fecha).toLocaleString('es-DO', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── PANEL DE ALERTAS INTELIGENTES ── */}
            {(() => {
              const hoy = new Date();
              const sinContacto = clientes.filter(c => {
                const ug = ultimaGestion(c.id);
                if (!ug) return ['Cotizado','Notificado','Vencido'].includes(c.estado);
                const dias = Math.floor((hoy - new Date(ug.fecha)) / 86400000);
                return dias > recordatoriosDias && ['Cotizado','Notificado','Vencido'].includes(c.estado);
              });
              const promesaIncumplida = clientes.filter(c => {
                const ug = ultimaGestion(c.id);
                return ug && ug.resultado === 'Promesa de Pago' && ug.proximaFecha && new Date(ug.proximaFecha) < hoy && c.estado !== 'Pagado' && c.estado !== 'Facturado';
              });
              const seguimientoHoy = clientes.filter(c => tieneProximoSeguimiento(c.id));
              if (sinContacto.length === 0 && promesaIncumplida.length === 0 && seguimientoHoy.length === 0) return null;
              return (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>🔔 Alertas Inteligentes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {seguimientoHoy.length > 0 && (
                      <div onClick={() => setActiveTab('agenda')} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 1rem', background:'#fef9c3', border:'1px solid #fde047', borderRadius:'10px', cursor:'pointer' }}>
                        <span style={{ fontSize:'1.3rem' }}>📅</span>
                        <div><div style={{ fontWeight:700, fontSize:'0.85rem', color:'#713f12' }}>{seguimientoHoy.length} cliente{seguimientoHoy.length>1?'s':''} con seguimiento pendiente HOY</div><div style={{ fontSize:'0.73rem', color:'#92400e' }}>{seguimientoHoy.slice(0,3).map(c=>c.nombre).join(', ')}{seguimientoHoy.length>3?` +${seguimientoHoy.length-3} más`:''}</div></div>
                        <span style={{ marginLeft:'auto', fontSize:'0.75rem', color:'#92400e', fontWeight:700 }}>Ver →</span>
                      </div>
                    )}
                    {promesaIncumplida.length > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 1rem', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:'10px' }}>
                        <span style={{ fontSize:'1.3rem' }}>⚠️</span>
                        <div><div style={{ fontWeight:700, fontSize:'0.85rem', color:'#991b1b' }}>{promesaIncumplida.length} promesa{promesaIncumplida.length>1?'s':''} de pago incumplida{promesaIncumplida.length>1?'s':''}</div><div style={{ fontSize:'0.73rem', color:'#b91c1c' }}>{promesaIncumplida.slice(0,3).map(c=>c.nombre).join(', ')}</div></div>
                      </div>
                    )}
                    {sinContacto.length > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 1rem', background:'#f0f9ff', border:'1px solid #7dd3fc', borderRadius:'10px' }}>
                        <span style={{ fontSize:'1.3rem' }}>📞</span>
                        <div><div style={{ fontWeight:700, fontSize:'0.85rem', color:'#075985' }}>{sinContacto.length} cliente{sinContacto.length>1?'s':''} sin contacto en más de {recordatoriosDias} días</div><div style={{ fontSize:'0.73rem', color:'#0369a1' }}>{sinContacto.slice(0,3).map(c=>c.nombre).join(', ')}{sinContacto.length>3?` +${sinContacto.length-3} más`:''}</div></div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── PROYECCIÓN DE COBROS ── */}
            {(() => {
              const mCotizado = estadisticas.montoCotizado || 0;
              const mNotificado = estadisticas.montoNotificado || 0;
              const mPagado = estadisticas.montoPagado || 0;
              const proyec30 = mPagado + mNotificado * 0.6 + mCotizado * 0.2;
              const proyec60 = mPagado + mNotificado * 0.8 + mCotizado * 0.5;
              const proyec90 = mPagado + mNotificado * 0.95 + mCotizado * 0.75;
              const fmt = v => v >= 1000000 ? `$${(v/1000000).toFixed(2)}M` : v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${Math.round(v).toLocaleString('en-US')}`;
              const maxVal = Math.max(proyec90, 1);
              return (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>📈 Proyección de Cobros</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    {[{ label: '30 días', val: proyec30, color: '#0284c7' }, { label: '60 días', val: proyec60, color: '#7c3aed' }, { label: '90 días', val: proyec90, color: '#059669' }].map(p => (
                      <div key={p.label} style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '0.85rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>{p.label}</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: p.color, fontFamily: 'var(--mono)' }}>{fmt(p.val)}</div>
                        <div style={{ marginTop: '0.4rem', height: '6px', background: 'var(--border)', borderRadius: '3px' }}>
                          <div style={{ height: '100%', width: `${(p.val / maxVal) * 100}%`, background: p.color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Estimado basado en pipeline actual · Pagado actual: <strong>{fmt(mPagado)}</strong> · Notificado: <strong>{fmt(mNotificado)}</strong> · Cotizado: <strong>{fmt(mCotizado)}</strong>
                  </div>
                </div>
              );
            })()}

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.2rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>⚡ Accesos rápidos</div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => { setActiveTab('cartera'); abrirModal(); }}>+ Nuevo Cliente</button>
                <button className="btn btn-success" onClick={() => setActiveTab('credito')}>+ Nuevo Crédito</button>
                <button className="btn btn-primary" style={{ background: '#0369a1' }} onClick={() => { setArchivosEnProceso([]); setShowCargaMasivaModal(true); }}>📂 Carga Masiva PDF</button>
                <button className="btn btn-primary" style={{ background: '#7c3aed' }} onClick={() => setShowPlantillasModal(true)}>💬 Plantillas WA</button>
                <button className="btn btn-primary" style={{ background: '#059669' }} onClick={() => setActiveTab('agenda')}>📅 Agenda del Día</button>
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

          {/* TAB AGENDA DEL DÍA */}
          <div className={`tab-content ${activeTab === 'agenda' ? 'active' : ''}`}>
            {(() => {
              const hoy = new Date(); hoy.setHours(23,59,59,999);
              const seguimientoHoy = clientes.filter(c => tieneProximoSeguimiento(c.id));
              const vencidosSinGestion = clientes.filter(c => c.estado === 'Vencido' && !(gestiones[c.id]||[]).length);
              const promesaIncumplida = clientes.filter(c => {
                const ug = ultimaGestion(c.id);
                return ug && ug.resultado === 'Promesa de Pago' && ug.proximaFecha && new Date(ug.proximaFecha) < hoy && c.estado !== 'Pagado' && c.estado !== 'Facturado';
              });
              const sinContactoReciente = clientes.filter(c => {
                const ug = ultimaGestion(c.id);
                if (!ug) return ['Cotizado','Notificado'].includes(c.estado);
                return Math.floor((new Date() - new Date(ug.fecha)) / 86400000) > recordatoriosDias && ['Cotizado','Notificado'].includes(c.estado);
              });
              const secciones = [
                { titulo: '📅 Seguimiento programado para hoy', color: '#713f12', bg: '#fef9c3', border: '#fde047', lista: seguimientoHoy },
                { titulo: '⚠️ Promesas de pago incumplidas', color: '#991b1b', bg: '#fef2f2', border: '#fca5a5', lista: promesaIncumplida },
                { titulo: '🔴 Vencidos sin ninguna gestión', color: '#7c2d12', bg: '#fff7ed', border: '#fed7aa', lista: vencidosSinGestion },
                { titulo: `📞 Sin contacto en más de ${recordatoriosDias} días`, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', lista: sinContactoReciente },
              ];
              return (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
                    <div>
                      <h2 style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--text)' }}>📅 Agenda del Día</h2>
                      <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{new Date().toLocaleDateString('es-DO',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
                    </div>
                    <div style={{ display:'flex', gap:'0.5rem' }}>
                      <button className="btn btn-primary" style={{ background:'#7c3aed' }} onClick={() => setShowPlantillasModal(true)}>💬 Plantillas WA</button>
                      {clientesSeleccionados.length > 0 && <button className="btn btn-primary" style={{ background:'#25d366' }} onClick={iniciarWaMasivo}>📱 WA Masivo ({clientesSeleccionados.length})</button>}
                    </div>
                  </div>
                  {secciones.every(s => s.lista.length === 0) ? (
                    <div style={{ textAlign:'center', padding:'3rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'14px' }}>
                      <div style={{ fontSize:'3rem', marginBottom:'0.75rem' }}>🎉</div>
                      <h3 style={{ fontWeight:800, color:'var(--text)' }}>¡Todo al día!</h3>
                      <p style={{ color:'var(--text-muted)', marginTop:'0.5rem' }}>No hay clientes pendientes de gestión por hoy.</p>
                    </div>
                  ) : secciones.map(sec => sec.lista.length === 0 ? null : (
                    <div key={sec.titulo} style={{ background:'var(--surface)', border:`1px solid var(--border)`, borderRadius:'14px', padding:'1.1rem 1.25rem', marginBottom:'1rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.85rem' }}>
                        <span style={{ fontWeight:800, fontSize:'0.9rem', color:sec.color }}>{sec.titulo}</span>
                        <span style={{ background:sec.bg, border:`1px solid ${sec.border}`, borderRadius:'20px', padding:'0.15rem 0.6rem', fontSize:'0.75rem', fontWeight:800, color:sec.color }}>{sec.lista.length}</span>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem' }}>
                        {sec.lista.map(c => {
                          const ug = ultimaGestion(c.id);
                          return (
                            <div key={c.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:'0.75rem', alignItems:'center', padding:'0.7rem 0.9rem', background:sec.bg, borderRadius:'10px', border:`1px solid ${sec.border}` }}>
                              {(() => { const av = getAvatar(c.nombre); return <div className="avatar avatar-sm" style={{ background:av.color }}>{av.letra}</div>; })()}
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>{c.nombre}</div>
                                <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', display:'flex', gap:'0.5rem', flexWrap:'wrap', marginTop:'0.15rem' }}>
                                  <span className={`badge badge-${c.estado.toLowerCase().replace(/ /g,'-')}`}>{c.estado}</span>
                                  {c.monto && <span style={{ fontWeight:700, color:'#059669' }}>RD${parseFloat(c.monto).toLocaleString('en-US')}</span>}
                                  {ug && <span>Última gestión: {new Date(ug.fecha).toLocaleDateString('es-DO')} · {ug.resultado}</span>}
                                  {ug?.proximaFecha && <span style={{ color:sec.color, fontWeight:700 }}>Seguimiento: {new Date(ug.proximaFecha).toLocaleDateString('es-DO')}</span>}
                                </div>
                              </div>
                              <div style={{ display:'flex', gap:'0.35rem', flexShrink:0 }}>
                                <button onClick={() => abrirGestionModal(c)} className="btn btn-secondary" style={{ fontSize:'0.75rem', padding:'0.3rem 0.65rem' }}>📞 Gestión</button>
                                {c.contacto && <button onClick={() => abrirWhatsappModal(c)} style={{ padding:'0.3rem 0.65rem', border:'1px solid #86efac', background:'#f0fdf4', borderRadius:'7px', cursor:'pointer', fontSize:'0.8rem' }}>🟢</button>}
                                <input type="checkbox" checked={clientesSeleccionados.includes(c.id)} onChange={() => toggleSeleccion(c.id)} style={{ cursor:'pointer', width:'16px', height:'16px' }} title="Seleccionar para WA masivo" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* TAB DOCUMENTOS */}
          <div className={`tab-content ${activeTab === 'documentos' ? 'active' : ''}`}>
            {/* Header con buscador */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text)' }}>📄 Documentos y Cotizaciones</h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Genera, sube y envía documentos a tus clientes por WhatsApp</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem' }} onClick={() => { setArchivosEnProceso([]); setShowCargaMasivaModal(true); }}>
                  📂 Carga Masiva
                </button>
                <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.4rem 0.85rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {Object.values(cotizaciones).reduce((s, d) => s + d.length, 0)} documentos en total
                </span>
              </div>
            </div>

            {/* Cómo funciona — si no hay documentos */}
            {Object.values(cotizaciones).reduce((s, d) => s + d.length, 0) === 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '2rem', marginBottom: '1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📋</div>
                <h3 style={{ fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>¿Cómo funciona?</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', maxWidth: '600px', margin: '1.25rem auto 0' }}>
                  {[
                    { paso: '1', icono: '✏️', titulo: 'Genera o sube', desc: 'Crea una cotización desde el sistema o sube tu PDF existente' },
                    { paso: '2', icono: '💾', titulo: 'Se guarda', desc: 'El documento queda guardado asociado al cliente automáticamente' },
                    { paso: '3', icono: '📤', titulo: 'Notifica', desc: 'El PDF se descarga y WhatsApp se abre con el mensaje listo' },
                  ].map(p => (
                    <div key={p.paso} style={{ background: 'var(--surface2)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{p.icono}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>{p.titulo}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de todos los clientes con sus documentos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {clientes.map(cliente => {
                const docs = cotizaciones[cliente.id] || [];
                return (
                  <div key={cliente.id} style={{ background: 'var(--surface)', border: `1px solid ${docs.length > 0 ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '12px', padding: '1rem 1.25rem', transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {/* Info del cliente */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {(() => { const av = getAvatar(cliente.nombre); return <div className="avatar" style={{ background: av.color }}>{av.letra}</div>; })()}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>{cliente.nombre}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            ID: {cliente.id} · <span className={`badge badge-${estadoActivoCliente(cliente).toLowerCase().replace(/ /g,'-')}`}>{estadoActivoCliente(cliente)}</span>
                            {docs.length > 0 && <span style={{ marginLeft: '0.5rem', color: 'var(--accent)', fontWeight: 700 }}>· {docs.length} doc{docs.length !== 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                      </div>
                      {/* Botones */}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => abrirGenCotModal(cliente)}>✏️ Generar Cotización</button>
                        <label className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', cursor: 'pointer' }}>
                          📂 Subir PDF
                          <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { subirDocumento(cliente.id, e.target.files[0]); e.target.value = ''; }} />
                        </label>
                        {docs.length > 0 && cliente.contacto && (
                          <button className="btn btn-success" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => abrirNotifDocModal(cliente)}>📤 Notificar por WhatsApp</button>
                        )}
                      </div>
                    </div>

                    {/* Documentos del cliente */}
                    {docs.length > 0 && (
                      <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {docs.map(doc => (
                          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.85rem', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '1.1rem' }}>{doc.tipo === 'generado' ? '📋' : '📄'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nombre}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {doc.tipo === 'generado' ? '✏️ Generado' : '📂 Subido'} · {new Date(doc.fecha).toLocaleDateString('es-DO', { day:'2-digit', month:'short', year:'numeric' })}
                                {doc.monto && <span style={{ color: '#059669', fontWeight: 700, marginLeft: '0.4rem' }}>${parseFloat(doc.monto).toLocaleString('en-US',{maximumFractionDigits:2})}</span>}
                              </div>
                            </div>
                            <button onClick={() => descargarDocumento(doc)} className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}>⬇️</button>
                            <button onClick={() => eliminarDocumento(cliente.id, doc.id)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {clientes.length === 0 && (
                <div className="empty-state"><h3>No hay clientes</h3><p>Agrega clientes en la pestaña Cartera primero</p></div>
              )}
            </div>
          </div>

          {/* TAB CARTERA */}
          <div className={`tab-content ${activeTab === 'cartera' ? 'active' : ''}`}>
            <div className="dashboard">
              {[
                { key: 'cotizado', label: 'Cotizado', val: estadisticas.cotizado, pct: estadisticas.cotizadoPct, monto: estadisticas.montoCotizado, color: '#ea580c' },
                { key: 'notificado', label: 'Notificado', val: estadisticas.notificado, pct: estadisticas.notificadoPct, monto: estadisticas.montoNotificado, color: '#0284c7' },
                { key: 'pagado', label: 'Pagado', val: estadisticas.pagado, pct: estadisticas.pagadoPct, monto: estadisticas.montoPagado, color: '#059669' },
                { key: 'facturado', label: 'Facturado', val: estadisticas.facturado, pct: estadisticas.facturadoPct, monto: estadisticas.montoFacturado, color: '#16a34a' },
                { key: 'vencido', label: 'Vencido', val: estadisticas.vencido, pct: estadisticas.vencidoPct, monto: estadisticas.montoVencido, color: '#dc2626' },
                { key: 'no-generaron', label: 'No Generaron', val: estadisticas.noGeneraron, pct: estadisticas.noGeneraronPct, monto: null, color: '#64748b' },
                { key: 'suspendido', label: 'Suspendidos', val: estadisticas.suspendido, pct: estadisticas.suspendidoPct, monto: estadisticas.montoSuspendido, color: '#dc2626' },
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
                {['todos', 'cotizado', 'notificado', 'pagado', 'facturado', 'vencido', 'no-generaron', 'delegaciones'].map(f => (
                  <button key={f} className={`btn btn-filter ${filter === f ? 'active' : ''}`} onClick={() => { setFilter(f); setPaginaActual(1); }}>
                    {f === 'todos' ? 'Todos' : f === 'no-generaron' ? 'No Generaron' : f === 'delegaciones' ? '🤝 Delegaciones' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button className="btn btn-secondary" onClick={() => { setVistaCards(false); setVistaKanban(false); }} style={{ background: !vistaCards && !vistaKanban ? 'var(--navy)' : '', color: !vistaCards && !vistaKanban ? 'white' : '' }} title="Tabla">📋</button>
                <button className="btn btn-secondary" onClick={() => { setVistaCards(true); setVistaKanban(false); }} style={{ background: vistaCards ? 'var(--navy)' : '', color: vistaCards ? 'white' : '' }} title="Tarjetas">🃏</button>
                <button className="btn btn-secondary" onClick={() => { setVistaKanban(true); setVistaCards(false); }} style={{ background: vistaKanban ? 'var(--navy)' : '', color: vistaKanban ? 'white' : '' }} title="Kanban">📌 Kanban</button>
                <button className="btn btn-secondary" onClick={() => setModoCompacto(m => !m)} style={{ background: modoCompacto ? 'var(--navy)' : '', color: modoCompacto ? 'white' : '' }} title="Modo compacto">⊟</button>
                <button className="btn btn-secondary" onClick={() => setShowBusquedaAvanzada(b => !b)} style={{ background: showBusquedaAvanzada ? 'var(--accent)' : '', color: showBusquedaAvanzada ? 'white' : '', position: 'relative' }} title="Filtros avanzados">
                  🎛️{(filtroMontoMin || filtroMontoMax || filtroEstados.length > 0 || filtroAgente) && <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: '#f97316', borderRadius: '50%' }}></span>}
                </button>
              </div>
              <button className="btn btn-primary" onClick={() => !esModoPasado && abrirModal()} disabled={esModoPasado} style={{ opacity: esModoPasado ? 0.5 : 1 }}>+ Nuevo Cliente</button>
            </div>

            {showBusquedaAvanzada && (
              <div className="adv-search-panel">
                <div className="panel-title">🎛️ Filtros Avanzados {(filtroMontoMin || filtroMontoMax || filtroEstados.length > 0 || filtroAgente) && <button onClick={() => { setFiltroMontoMin(''); setFiltroMontoMax(''); setFiltroEstados([]); setFiltroAgente(''); }} style={{ marginLeft: '0.5rem', padding: '0.1rem 0.5rem', fontSize: '0.68rem', border: '1px solid var(--danger)', borderRadius: '5px', background: '#fef2f2', color: 'var(--danger)', cursor: 'pointer', fontWeight: 700 }}>✕ Limpiar</button>}</div>
                <div className="adv-row">
                  <div className="adv-field">
                    <label>Monto mínimo</label>
                    <input type="number" value={filtroMontoMin} onChange={e => { setFiltroMontoMin(e.target.value); setPaginaActual(1); }} placeholder="0" />
                  </div>
                  <div className="adv-field">
                    <label>Monto máximo</label>
                    <input type="number" value={filtroMontoMax} onChange={e => { setFiltroMontoMax(e.target.value); setPaginaActual(1); }} placeholder="Sin límite" />
                  </div>
                  <div className="adv-field" style={{ flex: 3 }}>
                    <label>Estados (selección múltiple)</label>
                    <div className="estado-checkboxes">
                      {['Cotizado','Notificado','Pagado','Facturado','Vencido','No Generaron'].map(est => (
                        <div key={est} className={`estado-check ${filtroEstados.includes(est) ? 'selected' : ''}`} onClick={() => { setFiltroEstados(prev => prev.includes(est) ? prev.filter(x => x !== est) : [...prev, est]); setPaginaActual(1); }}>{est}</div>
                      ))}
                    </div>
                  </div>
                  {puedeVerTodo && (
                    <div className="adv-field">
                      <label>Agente</label>
                      <select value={filtroAgente} onChange={e => { setFiltroAgente(e.target.value); setPaginaActual(1); }} style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.85rem' }}>
                        <option value="">Todos</option>
                        {[...new Set(datosActuales.clientes.map(c => c.creadoPor).filter(Boolean))].sort().map(ag => (
                          <option key={ag} value={ag}>{ag}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {clientesFiltrados.length > 0 && <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mostrando <strong style={{ color: 'var(--accent)' }}>{clientesFiltrados.length}</strong> clientes con los filtros aplicados</div>}
              </div>
            )}

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
                        <span className={`badge badge-${estadoActivoCliente(cliente).toLowerCase().replace(/ /g, '-')}`}>{estadoActivoCliente(cliente)}</span>
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
                  const cols = clientesFiltrados.filter(c => estadoActivoCliente(c) === estado);
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
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{cliente.codigoCliente ? <span style={{ fontWeight: 700, color: 'var(--accent)' }}>#{cliente.codigoCliente}</span> : `#${cliente.id}`} · {cliente.mes}/{cliente.año}</div>
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
                  <table className={modoCompacto ? 'compact-mode' : ''}>
                    <thead><tr>
                      <th><input type="checkbox" onChange={toggleTodos} checked={clientesPaginados.length > 0 && clientesPaginados.every(c => clientesSeleccionados.includes(c.id))} style={{ cursor:'pointer' }} title="Seleccionar todos" /></th>
                      <th>ID</th><th>Código</th><th>Cliente</th>{puedeVerTodo && <th>Agente</th>}<th>Contacto</th><th>Estado Actual</th><th>Mes/Año</th><th>Monto</th><th>Fecha Cotización</th><th>Proceso</th><th>Suspensión</th><th>Opciones</th>
                    </tr></thead>
                    <tbody>
                      {clientesPaginados.map(cliente => {
                        const estaSuspendido = cliente.suspendido === true;
                        return (
                          <tr key={cliente.id} className={`${estaSuspendido ? 'cliente-suspendido' : ''} ${clientesSeleccionados.includes(cliente.id) ? 'row-selected' : ''}`}>
                            <td><input type="checkbox" checked={clientesSeleccionados.includes(cliente.id)} onChange={() => toggleSeleccion(cliente.id)} style={{ cursor:'pointer' }} /></td>
                            <td><div className="id-with-led"><span className={`status-led ${estaSuspendido ? 'suspended' : esClienteActivo(cliente) ? 'active' : 'inactive'}`}></span><strong>{cliente.id}</strong></div></td>
                            <td><strong style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{cliente.codigoCliente || '—'}</strong></td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {(() => { const av = getAvatar(cliente.nombre); return <div className="avatar avatar-sm" style={{ background: av.color }}>{av.letra}</div>; })()}
                                <div>
                                  <span onClick={() => { setHistorialPagosCliente(cliente); setShowHistorialPagosModal(true); }} className="nombre-cliente" title="Ver historial de pagos">{cliente.nombre}</span>
                                  {(tags[cliente.id] || []).length > 0 && (
                                    <div className="tags-wrap">
                                      {(tags[cliente.id] || []).map(tag => (
                                        <span key={tag} className={`tag-chip ${TAG_CLASSES[tag] || 'default'}`} onClick={() => eliminarTag(cliente.id, tag)} title="Clic para quitar">{tag} <span className="tag-x">×</span></span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <button onClick={() => { setTagClienteId(cliente.id); setTagInput(''); setShowTagModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.4, padding: '0 0.2rem' }} title="Agregar etiqueta">🏷️</button>
                              </div>
                            </td>
                            {puedeVerTodo && <td>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'var(--surface2)', padding: '0.15rem 0.5rem', borderRadius: '20px', color: 'var(--text-muted)' }}>{cliente.creadoPor || '—'}</span>
                              {cliente.assignedTo && cliente.assignedTo !== cliente.creadoPor && (
                                <div style={{ fontSize: '0.67rem', marginTop: '0.2rem', color: '#f97316', fontWeight: 700 }}>→ {cliente.assignedTo}</div>
                              )}
                            </td>}
                            <td>{cliente.contacto ? (
                              <span onClick={() => abrirWhatsappModal(cliente)} style={{ color: '#16a34a', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
                                📱 {cliente.contacto}
                              </span>
                            ) : '-'}</td>
                            <td><span className={`badge badge-${estadoActivoCliente(cliente).toLowerCase().replace(/ /g, '-')}`}>{estadoActivoCliente(cliente)}</span></td>
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
                                <button className={`proceso-icon cotizado ${cliente.fechaCotizacion ? 'done' : ''}`} disabled={esModoPasado} title={cliente.fechaCotizacion ? 'Cotizado' : 'Marcar Cotizado'} onClick={() => { if (esModoPasado) return; const a = { ...cliente }; if (!a.fechaCotizacion) { a.fechaCotizacion = new Date().toISOString().split('T')[0]; if (!a.estado || a.estado === 'No Generaron') a.estado = 'Cotizado'; } else { a.fechaCotizacion = ''; a.fechaNotificacion = ''; a.fechaPago = ''; a.fechaFacturacion = ''; a.pagosRealizados = []; a.estado = 'No Generaron'; } a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.fechaCotizacion ? 'Marco Cotizado' : 'Desmarco Cotizado', usuario: 'CPEREZ' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, a.estado); }}>📋</button>
                                <button className={`proceso-icon notificado ${cliente.fechaNotificacion ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaCotizacion} style={{ opacity: !cliente.fechaCotizacion ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaCotizacion) return; const a = { ...cliente }; if (!a.fechaNotificacion) { a.fechaNotificacion = new Date().toISOString().split('T')[0]; a.estado = 'Notificado'; } else { a.fechaNotificacion = ''; a.fechaPago = ''; a.fechaFacturacion = ''; a.pagosRealizados = []; a.estado = 'Cotizado'; } a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.fechaNotificacion ? 'Marco Notificado' : 'Desmarco Notificado', usuario: 'CPEREZ' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, a.estado); }}>📧</button>
                                <button className={`proceso-icon pagado ${cliente.fechaPago ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaNotificacion} style={{ opacity: !cliente.fechaNotificacion ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaNotificacion) return; const a = { ...cliente }; if (!a.fechaPago) { if (a.monto && parseFloat(a.monto) > 0) { abrirPagoModal(a); return; } a.fechaPago = new Date().toISOString().split('T')[0]; a.estado = 'Pagado'; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: 'Marco Pagado', usuario: 'CPEREZ' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, 'Pagado'); return; } a.fechaPago = ''; a.fechaFacturacion = ''; a.pagosRealizados = []; a.estado = 'Notificado'; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: 'Desmarco Pagado', usuario: 'CPEREZ' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, a.estado); }}>💰</button>
                                <button className={`proceso-icon facturado ${cliente.fechaFacturacion ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaPago} style={{ opacity: !cliente.fechaPago ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaPago) return; const a = { ...cliente }; if (!a.fechaFacturacion) { a.fechaFacturacion = new Date().toISOString().split('T')[0]; a.estado = 'Facturado'; } else { a.fechaFacturacion = ''; a.estado = 'Pagado'; } a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.fechaFacturacion ? 'Marco Facturado' : 'Desmarco Facturado', usuario: 'CPEREZ' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, a.estado); }}>💲</button>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {(estadoActivoCliente(cliente) === 'Pagado' || estadoActivoCliente(cliente) === 'Facturado') ? <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span> : (
                                <button disabled={esModoPasado} onClick={() => { if (esModoPasado) return; const a = { ...cliente }; a.suspendido = !a.suspendido; a.fechaSuspension = a.suspendido ? new Date().toISOString().split('T')[0] : ''; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.suspendido ? 'Cliente SUSPENDIDO' : 'Suspensión removida', usuario: 'CPEREZ' }]; actualizarCliente(a); }} style={{ padding: '0.3rem 0.65rem', borderRadius: '7px', border: cliente.suspendido ? '1px solid #dc2626' : '1px solid #cbd5e1', background: cliente.suspendido ? '#ef4444' : 'white', color: cliente.suspendido ? 'white' : '#64748b', fontWeight: 700, fontSize: '0.75rem', cursor: esModoPasado ? 'not-allowed' : 'pointer', opacity: esModoPasado ? 0.4 : 1 }}>
                                  {cliente.suspendido ? '🔴 Activo' : '⏸️ Suspender'}
                                </button>
                              )}
                            </td>
                            <td>
                              <div className="accion-icons">
                                {cliente.contacto && <button onClick={() => abrirWhatsappModal(cliente)} className="accion-btn" title="WhatsApp" style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a' }}>🟢</button>}
                                <button className="accion-btn edit" disabled={esModoPasado} title="Editar" onClick={() => !esModoPasado && abrirModal(cliente)}>✏️</button>
                                <button className={`accion-btn nota ${cliente.nota ? 'has-note' : ''}`} title={cliente.nota ? 'Ver nota' : 'Agregar nota'} onClick={() => abrirNotaModal(cliente)}>💬</button>
                                <button className={`accion-btn ${(cotizaciones[cliente.id]||[]).length > 0 ? 'has-note' : ''}`} title="Documentos / Cotizaciones" onClick={() => abrirDocsModal(cliente)} style={{ background: (cotizaciones[cliente.id]||[]).length > 0 ? '#ede9fe' : '', borderColor: (cotizaciones[cliente.id]||[]).length > 0 ? '#c4b5fd' : '', color: (cotizaciones[cliente.id]||[]).length > 0 ? '#7c3aed' : '' }}>📄{(cotizaciones[cliente.id]||[]).length > 0 && <span style={{ fontSize: '0.6rem', fontWeight: 800, marginLeft: '1px' }}>{(cotizaciones[cliente.id]||[]).length}</span>}</button>
                                <button className={`accion-btn ${(gestiones[cliente.id]||[]).length > 0 ? 'has-note' : ''}`} title="Registrar gestión / Bitácora" onClick={() => abrirGestionModal(cliente)} style={{ background: (gestiones[cliente.id]||[]).length > 0 ? '#fef9c3' : '', borderColor: (gestiones[cliente.id]||[]).length > 0 ? '#fde047' : '', color: (gestiones[cliente.id]||[]).length > 0 ? '#713f12' : '' }}>📞{(gestiones[cliente.id]||[]).length > 0 && <span style={{ fontSize: '0.6rem', fontWeight: 800, marginLeft: '1px' }}>{(gestiones[cliente.id]||[]).length}</span>}</button>
                                <button className="accion-btn" title="Estado de Cuenta PDF" onClick={() => generarEstadoCuentaPDF(cliente)} style={{ background: '#f0f9ff', border: '1px solid #7dd3fc', color: '#0369a1' }}>📋</button>
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

            {/* ── BARRA WHATSAPP MASIVO ── */}
            {clientesSeleccionados.length > 0 && (
              <div style={{ position:'sticky', bottom:'1rem', left:0, right:0, zIndex:200, background:'#1e2d4a', borderRadius:'14px', padding:'0.85rem 1.25rem', display:'flex', alignItems:'center', gap:'1rem', boxShadow:'0 8px 30px rgba(0,0,0,0.25)', flexWrap:'wrap' }}>
                <div style={{ color:'white', fontWeight:700, fontSize:'0.88rem' }}>
                  ✅ {clientesSeleccionados.length} cliente{clientesSeleccionados.length>1?'s':''} seleccionado{clientesSeleccionados.length>1?'s':''}
                </div>
                <button onClick={iniciarWaMasivo} style={{ background:'#25d366', color:'white', border:'none', borderRadius:'9px', padding:'0.5rem 1.1rem', fontWeight:700, fontSize:'0.85rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                  📱 WhatsApp Masivo
                </button>
                <button onClick={() => { const ids = clientesSeleccionados; ids.forEach(id => { const c = clientes.find(x=>x.id===id); if(c) abrirGestionModal(c); }); }} style={{ background:'#f59e0b', color:'white', border:'none', borderRadius:'9px', padding:'0.5rem 1.1rem', fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>
                  📞 Registrar Gestión
                </button>
                <button onClick={() => setClientesSeleccionados([])} style={{ marginLeft:'auto', background:'transparent', color:'#94a3b8', border:'1px solid #334155', borderRadius:'9px', padding:'0.45rem 0.9rem', fontSize:'0.82rem', cursor:'pointer' }}>
                  Cancelar selección
                </button>
              </div>
            )}
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
                              <input type="text" inputMode="decimal" value={tempCreditoMonto} onChange={(e) => setTempCreditoMonto(e.target.value)} onBlur={() => guardarCreditoMontoInline(credito.id)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardarCreditoMontoInline(credito.id); } else if (e.key === 'Escape') cancelarEdicionCreditoMonto(); }} autoFocus style={{ width: '100%', padding: '0.5rem', border: '2px solid #0ea5e9', borderRadius: '6px', fontWeight: 700 }} />
                            ) : (
                              <span onClick={() => iniciarEdicionCreditoMonto(credito)} style={{ cursor: 'pointer', padding: '0.5rem', borderRadius: '6px', display: 'inline-block', fontWeight: 700 }} title="Click para editar">${parseFloat(credito.monto || 0).toLocaleString()}</span>
                            )}
                          </td>
                          <td>{(() => { const s = calcularSaldosCredito(credito.monto, credito.abonos || []); const pct = s.total > 0 ? Math.min((s.abonado / s.total) * 100, 100) : 0; return <div style={{ minWidth: '110px' }}><div style={{ fontWeight: 700, color: s.pendiente > 0 ? '#f59e0b' : '#059669', marginBottom: '0.25rem' }}>${s.pendiente.toFixed(2)}</div>{s.total > 0 && <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? '#059669' : '#635bff' }}></div></div>}{s.abonado > 0 && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{pct.toFixed(0)}% pagado</div>}</div>; })()}</td>
                          <td>
                            <div className="proceso-icons">
                              <button className={`proceso-icon cotizado ${credito.fechaCotizacion ? 'done' : ''}`} onClick={() => { const a = { ...credito }; if (!a.fechaCotizacion) a.fechaCotizacion = new Date().toISOString().split('T')[0]; else { a.fechaCotizacion = ''; a.fechaNotificacionC = ''; a.fechaPagoC = ''; a.fechaFacturacionC = ''; } actualizarCredito(a); }}>📋</button>
                              <button className={`proceso-icon notificado ${credito.fechaNotificacionC ? 'done' : ''}`} disabled={!credito.fechaCotizacion} style={{ opacity: !credito.fechaCotizacion ? 0.3 : 1 }} onClick={() => { if (!credito.fechaCotizacion) return; const a = { ...credito }; if (!a.fechaNotificacionC) a.fechaNotificacionC = new Date().toISOString().split('T')[0]; else { a.fechaNotificacionC = ''; a.fechaPagoC = ''; a.fechaFacturacionC = ''; } actualizarCredito(a); }}>📧</button>
                              <button className={`proceso-icon pagado ${credito.fechaPagoC ? 'done' : ''}`} disabled={!credito.fechaNotificacionC} style={{ opacity: !credito.fechaNotificacionC ? 0.3 : 1 }} onClick={() => { if (!credito.fechaNotificacionC) return; if (!credito.fechaPagoC) { abrirPagoCreditoModal(credito); return; } const a = { ...credito }; a.fechaPagoC = ''; a.fechaFacturacionC = ''; a.abonos = []; a.estado = 'Activo'; actualizarCredito(a); }}>💰</button>
                              <button className={`proceso-icon facturado ${credito.fechaFacturacionC ? 'done' : ''}`} disabled={!credito.fechaPagoC} style={{ opacity: !credito.fechaPagoC ? 0.3 : 1 }} onClick={() => { if (!credito.fechaPagoC) return; const a = { ...credito }; if (!a.fechaFacturacionC) a.fechaFacturacionC = new Date().toISOString().split('T')[0]; else a.fechaFacturacionC = ''; actualizarCredito(a); }}>💲</button>
                            </div>
                          </td>
                          <td>{new Date(credito.fechaInicio).toLocaleDateString('es-DO')}</td>
                          <td>{credito.plazoMeses} {credito.plazoMeses === '1' ? 'mes' : 'meses'}</td>
                          <td>{new Date(credito.fechaVencimiento).toLocaleDateString('es-DO')}</td>
                          <td>{credito.estado !== 'Pagado' && <span className={`dias-restantes ${diasRestantes < 0 ? 'critico' : diasRestantes <= 3 ? 'critico' : diasRestantes <= 7 ? 'advertencia' : ''}`}>{diasRestantes < 0 ? `${Math.abs(diasRestantes)} días vencido` : `${diasRestantes} días`}</span>}</td>
                          <td><span className={`badge badge-${credito.estado.toLowerCase().replace(/ /g, '-')}`}>{credito.estado}</span></td>
                          <td>
                            <div className="action-btns">
                              {credito.estado !== 'Pagado' && <button className="btn-icon" onClick={() => { const a = { ...credito, estado: 'Pagado', historial: [...(credito.historial || []), { fecha: new Date().toISOString(), accion: 'Marcado como Pagado' }] }; actualizarCredito(a); }} title="Marcar Pagado">✅</button>}
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

          {/* TAB CARTERAS POR AGENTE */}
          {puedeVerTodo && (
            <div className={`tab-content ${activeTab === 'carteras' ? 'active' : ''}`}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>Carteras por Agente</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Resumen de clientes y créditos registrados por cada usuario</p>
              </div>
              {(() => {
                const agentes = [...new Set([
                  ...datosActuales.clientes.map(c => c.creadoPor),
                  ...datosActuales.creditos.map(c => c.creadoPor),
                ].filter(Boolean))].sort();

                if (agentes.length === 0) {
                  return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>No hay registros con agente asignado aún.</div>;
                }

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.2rem' }}>
                    {agentes.map(agente => {
                      const clientesAgente = datosActuales.clientes.filter(c => c.creadoPor === agente);
                      const creditosAgente = datosActuales.creditos.filter(c => c.creadoPor === agente);
                      const totalMonto = clientesAgente.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
                      const totalCreditos = creditosAgente.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
                      const estadoCount = clientesAgente.reduce((acc, c) => { acc[c.estado] = (acc[c.estado] || 0) + 1; return acc; }, {});
                      const nombreUsuario = usuarios[agente]?.nombre || agente;
                      return (
                        <div key={agente} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.3rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', flexShrink: 0 }}>
                              {agente.charAt(0)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>{nombreUsuario}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>@{agente} · {usuarios[agente]?.rol || 'sin rol'}</div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                            <div style={{ background: 'var(--surface2)', borderRadius: '9px', padding: '0.7rem', textAlign: 'center' }}>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>{clientesAgente.length}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>CLIENTES</div>
                            </div>
                            <div style={{ background: 'var(--surface2)', borderRadius: '9px', padding: '0.7rem', textAlign: 'center' }}>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669' }}>{creditosAgente.length}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>CRÉDITOS</div>
                            </div>
                          </div>
                          <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Monto cartera</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent2)' }}>${totalMonto.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                          </div>
                          {totalCreditos > 0 && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Monto créditos</div>
                              <div style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--mono)', color: '#059669' }}>${totalCreditos.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                            </div>
                          )}
                          {Object.keys(estadoCount).length > 0 && (
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Por estado</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {Object.entries(estadoCount).map(([est, cnt]) => (
                                  <span key={est} className={`badge badge-${est.toLowerCase().replace(/ /g, '-')}`} style={{ fontSize: '0.68rem' }}>{est}: {cnt}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                            <button onClick={() => { setFiltroAgente(agente); setActiveTab('cartera'); }} style={{ width: '100%', padding: '0.5rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                              Ver cartera de {nombreUsuario}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB DELEGACIONES */}
          {(esAdmin || esEditor) && (
            <div className={`tab-content ${activeTab === 'delegations' ? 'active' : ''}`}>
              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.75rem' }}>
                {['delegations', 'recibidas', 'actividad'].map(t => (
                  <button key={t} onClick={() => { setActividadTab(t); if (t === 'actividad') cargarActividad(actividadFiltro); }}
                    style={{ padding: '0.45rem 1.1rem', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                      background: actividadTab === t ? 'var(--accent)' : 'var(--surface2)', color: actividadTab === t ? 'white' : 'var(--text-muted)' }}>
                    {t === 'delegations' ? 'Mis Delegations' : t === 'recibidas' ? 'Recibidas' : 'Actividad'}
                  </button>
                ))}
              </div>

              {/* Sub-tab: MIS DELEGACIONES */}
              {actividadTab === 'delegations' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>Mis Delegations</h3>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Delegations que has creado para otros usuarios</p>
                    </div>
                    <button onClick={() => { setShowCrearDelegacionModal(true); setDelegacionWizardStep(1); }} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>+ Nueva Delegación</button>
                  </div>
                  {delegations.comoDueno.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.9rem', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      No has creado ninguna delegación aún.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="tabla-clientes" style={{ minWidth: '700px' }}>
                        <thead><tr>
                          <th>Delegatario</th><th>Tipo</th><th>Clientes</th><th>Inicio</th><th>Fin</th><th>Permisos</th><th>Estado</th><th>Acciones</th>
                        </tr></thead>
                        <tbody>
                          {delegations.comoDueno.map(d => {
                            const statusColors = { pending: '#f59e0b', accepted: '#10b981', rejected: '#ef4444', expired: '#94a3b8', cancelled: '#94a3b8' };
                            const statusLabels = { pending: 'Pendiente', accepted: 'Activa', rejected: 'Rechazada', expired: 'Expirada', cancelled: 'Cancelada' };
                            return (
                              <tr key={d.id}>
                                <td><div style={{ fontWeight: 700 }}>{d.assignedNombre}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>@{d.assignedUserId}</div></td>
                                <td><span style={{ fontSize: '0.75rem', fontWeight: 700, background: d.tipo === 'total' ? '#dbeafe' : '#fef9c3', color: d.tipo === 'total' ? '#1d4ed8' : '#854d0e', padding: '0.2rem 0.55rem', borderRadius: '20px' }}>{d.tipo === 'total' ? 'Total' : 'Parcial'}</span></td>
                                <td><strong>{d.cantidadClientes}</strong></td>
                                <td style={{ fontSize: '0.82rem' }}>{d.startDate}</td>
                                <td style={{ fontSize: '0.82rem' }}>{d.endDate}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                    {d.permisos.can_edit && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700 }}>✏️ Editar</span>}
                                    {d.permisos.can_register_payments && <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700 }}>💰 Pagos</span>}
                                    {d.permisos.can_delete && <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#991b1b', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700 }}>🗑️ Eliminar</span>}
                                  </div>
                                </td>
                                <td><span style={{ fontSize: '0.75rem', fontWeight: 700, background: statusColors[d.status] + '20', color: statusColors[d.status], padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{statusLabels[d.status] || d.status}</span></td>
                                <td>
                                  {['pending', 'accepted'].includes(d.status) && (
                                    <button onClick={() => cancelarDelegacion(d.id)} className="accion-btn delete" title="Cancelar delegación" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>Cancelar</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab: RECIBIDAS */}
              {actividadTab === 'recibidas' && (
                <div>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>Delegations Recibidas</h3>
                  {delegations.comoRecibidas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.9rem', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      No tienes delegations recibidas.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                      {delegations.comoRecibidas.map(d => {
                        const statusColors = { pending: '#f59e0b', accepted: '#10b981', rejected: '#ef4444', expired: '#94a3b8', cancelled: '#94a3b8' };
                        const statusLabels = { pending: 'Pendiente', accepted: 'Activa', rejected: 'Rechazada', expired: 'Expirada', cancelled: 'Cancelada' };
                        const hoy = new Date().toISOString().slice(0,10);
                        const diasRestantes = Math.ceil((new Date(d.endDate) - new Date(hoy)) / 86400000);
                        return (
                          <div key={d.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '1rem' }}>De: {d.ownerNombre}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>@{d.ownerId}</div>
                              </div>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, background: statusColors[d.status] + '20', color: statusColors[d.status], padding: '0.2rem 0.6rem', borderRadius: '20px' }}>{statusLabels[d.status] || d.status}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '0.5rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>{d.cantidadClientes}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>CLIENTES</div>
                              </div>
                              <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '0.5rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: d.status === 'accepted' && diasRestantes <= 3 ? '#ef4444' : 'var(--accent2)' }}>{d.status === 'accepted' ? diasRestantes : '—'}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>DÍAS REST.</div>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                              {d.startDate} → {d.endDate}
                            </div>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                              {d.permisos.can_edit && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700 }}>✏️ Editar</span>}
                              {d.permisos.can_register_payments && <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700 }}>💰 Pagos</span>}
                              {d.permisos.can_delete && <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#991b1b', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700 }}>🗑️ Eliminar</span>}
                              {d.permisos.read_only || (!d.permisos.can_edit && !d.permisos.can_register_payments && !d.permisos.can_delete) && <span style={{ fontSize: '0.65rem', background: 'var(--surface2)', color: 'var(--text-muted)', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700 }}>👁 Solo lectura</span>}
                            </div>
                            {d.status === 'accepted' && (
                              <button onClick={() => { setFiltroAgente(currentUser); setActiveTab('cartera'); }} style={{ marginTop: '0.75rem', width: '100%', padding: '0.45rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                                Ver clientes asignados
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab: ACTIVIDAD */}
              {actividadTab === 'actividad' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>Actividad de Delegados</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={actividadFiltro.delegationId} onChange={e => setActividadFiltro(f => ({ ...f, delegationId: e.target.value }))} style={{ padding: '0.35rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.82rem' }}>
                        <option value="">Todas las delegations</option>
                        {delegations.comoDueno.filter(d => d.status === 'accepted' || d.status === 'expired').map(d => (
                          <option key={d.id} value={d.id}>#{d.id} → {d.assignedNombre}</option>
                        ))}
                      </select>
                      <input type="date" value={actividadFiltro.desde} onChange={e => setActividadFiltro(f => ({ ...f, desde: e.target.value }))} style={{ padding: '0.35rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.82rem' }} />
                      <input type="date" value={actividadFiltro.hasta} onChange={e => setActividadFiltro(f => ({ ...f, hasta: e.target.value }))} style={{ padding: '0.35rem 0.6rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.82rem' }} />
                      <button onClick={() => cargarActividad(actividadFiltro)} className="btn btn-secondary" style={{ fontSize: '0.82rem' }}>Buscar</button>
                    </div>
                  </div>
                  {actividad.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.9rem', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      No hay actividad registrada aún. Usa los filtros y presiona Buscar.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="tabla-clientes" style={{ minWidth: '600px' }}>
                        <thead><tr><th>Fecha</th><th>Acción</th><th>Realizado por</th><th>Cliente ID</th><th>Delegación</th><th>Detalle</th></tr></thead>
                        <tbody>
                          {actividad.map(a => {
                            const actionColors = { EDITAR: '#3b82f6', PAGO_ADD: '#10b981', PAGO_DEL: '#f59e0b', ELIMINAR: '#ef4444', DELEGACION_ACEPTADA: '#8b5cf6', DELEGACION_RECHAZADA: '#ef4444', DELEGACION_CANCELADA: '#94a3b8', DELEGACION_EXPIRADA: '#94a3b8' };
                            return (
                              <tr key={a.id}>
                                <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('es-DO')}</td>
                                <td><span style={{ fontSize: '0.72rem', fontWeight: 700, background: (actionColors[a.action_type] || '#94a3b8') + '20', color: actionColors[a.action_type] || '#94a3b8', padding: '0.15rem 0.5rem', borderRadius: '9px' }}>{a.action_type}</span></td>
                                <td style={{ fontWeight: 700, fontSize: '0.82rem', fontFamily: 'var(--mono)' }}>{a.performed_by}</td>
                                <td style={{ fontSize: '0.82rem' }}>{a.client_id || '—'}</td>
                                <td style={{ fontSize: '0.78rem' }}>#{a.delegation_id || '—'}</td>
                                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.description}>{a.description}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MODALES */}
          {/* Modal Cliente */}
          <div className={`modal ${showModal ? 'show' : ''}`}>
            <div className="modal-content">
              <div className="modal-header"><h2>{editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}</h2><button className="close-btn" onClick={cerrarModal}>×</button></div>
              <form onSubmit={guardarCliente}>
                {editingCliente && <div className="form-group"><label>ID del Sistema</label><input type="number" value={formData.id || ''} readOnly style={{ background: 'var(--surface2)', cursor: 'default', color: 'var(--text-muted)' }} /></div>}
                <div className="form-group"><label>Código de Cliente</label><input type="number" value={formData.codigoCliente || ''} onChange={(e) => setFormData({ ...formData, codigoCliente: e.target.value })} placeholder="Ej: 1001" /></div>
                <div className="form-group"><label>Nombre del Cliente *</label><input type="text" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required /></div>
                <div className="form-group"><label>Contacto (Teléfono)</label><input type="text" value={formData.contacto} onChange={(e) => setFormData({ ...formData, contacto: e.target.value })} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group"><label>Mes *</label><select value={formData.mes} onChange={(e) => setFormData({ ...formData, mes: e.target.value })} required><option value="">Seleccionar...</option>{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                  <div className="form-group"><label>Año *</label><input type="number" value={formData.año} onChange={(e) => setFormData({ ...formData, año: e.target.value })} min="2024" max="2030" required /></div>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Monto</span>
                    <label style={{ cursor: pdfCargando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.6rem', background: '#f1f5f9', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', userSelect: 'none' }}>
                      {pdfCargando ? '⏳ Leyendo PDF…' : '📄 Leer desde factura PDF'}
                      <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} disabled={pdfCargando} onChange={e => { if (e.target.files[0]) leerFacturaPDF(e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  </label>
                  <input type="number" value={formData.monto} onChange={(e) => setFormData({ ...formData, monto: e.target.value })} step="0.01" placeholder="Ej: 5000" />
                  {pdfError && (
                    <div style={{ fontSize: '0.73rem', color: 'var(--danger)', marginTop: '0.25rem', whiteSpace: 'pre-wrap', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.4rem 0.6rem', maxHeight: '120px', overflowY: 'auto' }}>
                      ⚠️ {pdfError}
                    </div>
                  )}
                </div>
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

          <div id="save-indicator" className="save-indicator" style={{ display: 'none' }}></div>

          {/* ── Modal: Notificación de Delegación Pendiente ─────── */}
          {showPendienteModal && delegationsPendientes.length > 0 && (() => {
            const d = delegationsPendientes[pendienteIdx];
            if (!d) return null;
            return (
              <div className="modal show" style={{ zIndex: 100000 }}>
                <div className="modal-content" style={{ maxWidth: '480px', border: '2px solid #f97316' }}>
                  <div className="modal-header" style={{ background: 'linear-gradient(135deg, #fff7ed, #ffedd5)', borderRadius: '12px 12px 0 0' }}>
                    <h2 style={{ fontSize: '1.1rem', color: '#c2410c' }}>📥 Solicitud de Delegación</h2>
                    {delegationsPendientes.length > 1 && <span style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: 700 }}>{pendienteIdx + 1}/{delegationsPendientes.length}</span>}
                  </div>
                  <div style={{ padding: '1.25rem' }}>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.93rem', color: 'var(--text)', lineHeight: 1.6 }}>
                      <strong>{d.ownerNombre} (@{d.ownerId})</strong> te ha enviado una solicitud para cubrir su cartera de clientes.
                    </p>
                    <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent)' }}>{d.cantidadClientes}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>CLIENTES</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>{d.startDate}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>al</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>{d.endDate}</div>
                      </div>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Permisos que tendrás</div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {d.permisos.can_edit && <span style={{ fontSize: '0.78rem', background: '#dcfce7', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: '9px', fontWeight: 700 }}>✏️ Editar</span>}
                        {d.permisos.can_register_payments && <span style={{ fontSize: '0.78rem', background: '#dbeafe', color: '#1e40af', padding: '0.2rem 0.6rem', borderRadius: '9px', fontWeight: 700 }}>💰 Pagos</span>}
                        {d.permisos.can_delete && <span style={{ fontSize: '0.78rem', background: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.6rem', borderRadius: '9px', fontWeight: 700 }}>🗑️ Eliminar</span>}
                        {d.permisos.read_only || (!d.permisos.can_edit && !d.permisos.can_register_payments && !d.permisos.can_delete) && <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', color: 'var(--text-muted)', padding: '0.2rem 0.6rem', borderRadius: '9px', fontWeight: 700 }}>👁 Solo lectura</span>}
                      </div>
                    </div>
                    <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      ¿Deseas aceptar esta delegación? Si aceptas, los clientes aparecerán en tu cartera mientras dure el período asignado.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn-secondary" onClick={() => responderDelegacion(d.id, 'rechazar')} style={{ flex: 1 }}>Rechazar</button>
                      <button className="btn btn-primary" onClick={() => responderDelegacion(d.id, 'aceptar')} style={{ flex: 1, background: '#10b981', border: 'none' }}>✅ Aceptar</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Modal: Crear Delegación (Wizard 3 pasos) ─────────── */}
          {showCrearDelegacionModal && (
            <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowCrearDelegacionModal(false); }}>
              <div className="modal-content" style={{ maxWidth: '580px' }}>
                <div className="modal-header">
                  <h2>Crear Delegación — Paso {delegacionWizardStep} de 3</h2>
                  <button className="close-btn" onClick={() => setShowCrearDelegacionModal(false)}>×</button>
                </div>
                {/* Barra de progreso */}
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem' }}>
                  {[1,2,3].map(s => <div key={s} style={{ flex: 1, height: '4px', borderRadius: '4px', background: delegacionWizardStep >= s ? 'var(--accent)' : 'var(--border)' }}></div>)}
                </div>

                {/* Paso 1: Usuario y fechas */}
                {delegacionWizardStep === 1 && (
                  <div>
                    <div className="form-group">
                      <label>Usuario destino *</label>
                      <select value={delegacionForm.assignedUserId} onChange={e => setDelegacionForm(f => ({ ...f, assignedUserId: e.target.value }))}
                        style={{ padding: '0.55rem', border: '1px solid var(--border2)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.9rem', width: '100%' }}>
                        <option value="">Seleccionar usuario...</option>
                        {Object.entries(usuarios).filter(([u]) => u !== (session?.user?.username || currentUser)).map(([u, info]) => (
                          <option key={u} value={u}>{info.nombre || u} (@{u}) — {info.rol}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group"><label>Fecha inicio *</label><input type="date" value={delegacionForm.startDate} onChange={e => setDelegacionForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                      <div className="form-group"><label>Fecha fin *</label><input type="date" value={delegacionForm.endDate} onChange={e => setDelegacionForm(f => ({ ...f, endDate: e.target.value }))} /></div>
                    </div>
                    <div className="form-group">
                      <label>Tipo de delegación</label>
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {['total', 'parcial'].map(t => (
                          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.6rem 1rem', border: `2px solid ${delegacionForm.tipo === t ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '9px', flex: 1, fontWeight: 600, fontSize: '0.88rem', background: delegacionForm.tipo === t ? 'rgba(var(--accent-rgb),0.08)' : 'transparent' }}>
                            <input type="radio" name="tipo" value={t} checked={delegacionForm.tipo === t} onChange={() => setDelegacionForm(f => ({ ...f, tipo: t, clienteIds: [] }))} style={{ marginRight: '0.2rem' }} />
                            {t === 'total' ? '📋 Total (todos mis clientes)' : '🎯 Parcial (seleccionar)'}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-secondary" onClick={() => setShowCrearDelegacionModal(false)}>Cancelar</button>
                      <button className="btn btn-primary" onClick={() => {
                        if (!delegacionForm.assignedUserId) { showToast('Selecciona un usuario.', 'error'); return; }
                        if (!delegacionForm.startDate || !delegacionForm.endDate) { showToast('Completa las fechas.', 'error'); return; }
                        if (delegacionForm.endDate <= delegacionForm.startDate) { showToast('La fecha fin debe ser posterior.', 'error'); return; }
                        setDelegacionWizardStep(delegacionForm.tipo === 'parcial' ? 2 : 3);
                      }}>Siguiente →</button>
                    </div>
                  </div>
                )}

                {/* Paso 2: Selección de clientes (solo para parcial) */}
                {delegacionWizardStep === 2 && delegacionForm.tipo === 'parcial' && (() => {
                  const misClientes = clientes.filter(c => c.creadoPor === (session?.user?.username || currentUser) &&
                    (!delegacionBusquedaCliente || c.nombre.toLowerCase().includes(delegacionBusquedaCliente.toLowerCase())));
                  const todosSeleccionados = misClientes.length > 0 && misClientes.every(c => delegacionForm.clienteIds.includes(c.id));
                  return (
                    <div>
                      <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>Selecciona los clientes que deseas delegar:</p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <input type="text" placeholder="Buscar cliente..." value={delegacionBusquedaCliente} onChange={e => setDelegacionBusquedaCliente(e.target.value)}
                          style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid var(--border2)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.88rem' }} />
                        <button className="btn btn-secondary" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
                          onClick={() => {
                            if (todosSeleccionados) {
                              setDelegacionForm(f => ({ ...f, clienteIds: f.clienteIds.filter(id => !misClientes.find(c => c.id === id)) }));
                            } else {
                              const nuevos = misClientes.map(c => c.id);
                              setDelegacionForm(f => ({ ...f, clienteIds: [...new Set([...f.clienteIds, ...nuevos])] }));
                            }
                          }}>
                          {todosSeleccionados ? '☐ Deseleccionar todos' : '☑ Seleccionar todos'}
                        </button>
                      </div>
                      <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        {misClientes.length === 0 && (
                          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No hay clientes que coincidan.</div>
                        )}
                        {misClientes.map(c => (
                          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.9rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: delegacionForm.clienteIds.includes(c.id) ? 'rgba(var(--accent-rgb),0.06)' : 'transparent' }}>
                            <input type="checkbox" checked={delegacionForm.clienteIds.includes(c.id)} onChange={e => setDelegacionForm(f => ({ ...f, clienteIds: e.target.checked ? [...f.clienteIds, c.id] : f.clienteIds.filter(x => x !== c.id) }))} />
                            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.nombre}</span>
                            {c.delegationId && <span style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: 700 }}>EN DELEGACIÓN</span>}
                            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>ID: {c.id} · ${(parseFloat(c.monto) || 0).toLocaleString()}</span>
                          </label>
                        ))}
                      </div>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{delegacionForm.clienteIds.length} de {misClientes.length} cliente(s) seleccionado(s)</div>
                      <div className="form-actions">
                        <button className="btn btn-secondary" onClick={() => setDelegacionWizardStep(1)}>← Atrás</button>
                        <button className="btn btn-primary" onClick={() => {
                          if (delegacionForm.clienteIds.length === 0) { showToast('Selecciona al menos un cliente.', 'error'); return; }
                          setDelegacionWizardStep(3);
                        }}>Siguiente →</button>
                      </div>
                    </div>
                  );
                })()}

                {/* Paso 3: Permisos y resumen */}
                {delegacionWizardStep === 3 && (
                  <div>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>Configura los permisos del usuario delegado sobre tus clientes:</p>
                    {[
                      { key: 'can_edit', label: '✏️ Puede editar datos del cliente', desc: 'Nombre, contacto, estado, monto, comentarios' },
                      { key: 'can_register_payments', label: '💰 Puede registrar y eliminar pagos', desc: 'Gestión del historial de pagos' },
                      { key: 'can_delete', label: '🗑️ Puede eliminar clientes', desc: 'Eliminación permanente (recomendado: desactivado)' },
                      { key: 'read_only', label: '👁 Solo lectura', desc: 'Bloquea edición, pagos y eliminación — solo visualización' },
                    ].map(p => (
                      <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: `1px solid ${delegacionForm.permisos[p.key] ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '9px', marginBottom: '0.5rem', cursor: 'pointer', background: delegacionForm.permisos[p.key] ? 'rgba(var(--accent-rgb),0.05)' : 'transparent' }}>
                        <input type="checkbox" checked={delegacionForm.permisos[p.key]} onChange={e => setDelegacionForm(f => ({ ...f, permisos: { ...f.permisos, [p.key]: e.target.checked } }))} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{p.label}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.desc}</div>
                        </div>
                      </label>
                    ))}
                    <div style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '1rem', marginTop: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                      <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '0.4rem' }}>Resumen</strong>
                      Usuario: <strong>{delegacionForm.assignedUserId}</strong><br/>
                      Período: <strong>{delegacionForm.startDate} → {delegacionForm.endDate}</strong><br/>
                      Tipo: <strong>{delegacionForm.tipo === 'total' ? 'Total (todos tus clientes)' : `Parcial (${delegacionForm.clienteIds.length} clientes)`}</strong>
                    </div>
                    <div className="form-actions" style={{ marginTop: '1.25rem' }}>
                      <button className="btn btn-secondary" onClick={() => setDelegacionWizardStep(delegacionForm.tipo === 'parcial' ? 2 : 1)}>← Atrás</button>
                      <button className="btn btn-primary" onClick={crearDelegacion}>Enviar Solicitud</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Modal de Confirmación ─────────────────────────── */}
          {confirmModal.show && (
            <div className="modal show" style={{ zIndex: 99999 }}>
              <div className="modal-content" style={{ maxWidth: '420px' }}>
                <div className="modal-header">
                  <h2 style={{ fontSize: '1.1rem', color: '#dc2626' }}>⚠️ {confirmModal.titulo}</h2>
                  <button className="close-btn" onClick={cerrarConfirm}>×</button>
                </div>
                <div style={{ padding: '1.25rem 0', fontSize: '0.93rem', color: 'var(--text)', lineHeight: 1.6 }}>
                  {confirmModal.mensaje}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={cerrarConfirm}>Cancelar</button>
                  <button className="btn" style={{ background: '#dc2626', color: 'white', border: 'none' }}
                    onClick={() => { confirmModal.onConfirm?.(); cerrarConfirm(); }}>
                    Sí, eliminar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Documentos del Cliente ────────────────── */}
      {showDocsModal && docsClienteId && (() => {
        const cliente = clientes.find(c => c.id === docsClienteId);
        if (!cliente) return null;
        const docs = cotizaciones[docsClienteId] || [];
        return (
          <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowDocsModal(false); }}>
            <div className="modal-content" style={{ maxWidth: '560px' }}>
              <div className="modal-header">
                <h2>📄 Documentos — {cliente.nombre}</h2>
                <button className="close-btn" onClick={() => setShowDocsModal(false)}>×</button>
              </div>

              {/* Acciones principales */}
              <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => { setShowDocsModal(false); abrirGenCotModal(cliente); }}>✏️ Generar Cotización</button>
                <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  📂 Subir PDF
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { subirDocumento(docsClienteId, e.target.files[0]); e.target.value = ''; }} />
                </label>
                <button className="btn btn-secondary" onClick={() => setNuevaCotForm(f => ({ ...f, show: !f.show, monto: '', estado: 'Cotizado' }))}>➕ Nueva Cotización</button>
                {docs.filter(d => d.base64).length > 0 && (
                  <button className="btn btn-success" onClick={() => { setShowDocsModal(false); abrirNotifDocModal(cliente); }}>
                    📤 Notificar con Documento
                  </button>
                )}
              </div>

              {/* Formulario nueva cotización manual */}
              {nuevaCotForm.show && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <input type="number" placeholder="Monto RD$" value={nuevaCotForm.monto} onChange={e => setNuevaCotForm(f => ({ ...f, monto: e.target.value }))} style={{ flex: '1', minWidth: '120px', padding: '0.4rem 0.65rem', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '0.85rem' }} />
                  <select value={nuevaCotForm.estado} onChange={e => setNuevaCotForm(f => ({ ...f, estado: e.target.value }))} style={{ padding: '0.4rem 0.65rem', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                    {['Cotizado','Notificado','Pagado','Facturado','Vencido'].map(est => <option key={est} value={est}>{est}</option>)}
                  </select>
                  <button className="btn btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }} onClick={() => { if (!nuevaCotForm.monto || parseFloat(nuevaCotForm.monto) <= 0) return; crearCotizacionManual(docsClienteId, nuevaCotForm.monto, nuevaCotForm.estado); setNuevaCotForm(f => ({ ...f, show: false, monto: '' })); }}>Guardar</button>
                  <button className="btn btn-secondary" style={{ padding: '0.4rem 0.65rem', fontSize: '0.82rem' }} onClick={() => setNuevaCotForm(f => ({ ...f, show: false }))}>Cancelar</button>
                </div>
              )}

              {/* Lista de cotizaciones/documentos */}
              {docs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '12px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
                  <p style={{ fontWeight: 600 }}>Sin cotizaciones aún</p>
                  <p style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Genera, sube un PDF o crea una cotización manual</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '340px', overflowY: 'auto' }}>
                  {docs.map(doc => {
                    const ESTADO_COLORS = { Cotizado: '#ea580c', Notificado: '#0284c7', Pagado: '#059669', Facturado: '#16a34a', Vencido: '#dc2626' };
                    const color = ESTADO_COLORS[doc.estado] || '#64748b';
                    return (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '1.8rem', flexShrink: 0 }}>{doc.tipo === 'generado' ? '📋' : doc.tipo === 'manual' ? '📝' : doc.tipo === 'legacy' ? '🗂️' : '📄'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nombre || (doc.tipo === 'manual' ? 'Cotización manual' : doc.tipo === 'legacy' ? 'Datos anteriores' : '—')}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                            {new Date(doc.fecha).toLocaleDateString('es-DO')}
                            {doc.monto && <span style={{ marginLeft: '0.5rem', color: '#059669', fontWeight: 700 }}>RD${parseFloat(doc.monto).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
                          </div>
                        </div>
                        <select value={doc.estado || 'Cotizado'} onChange={e => actualizarEstadoCotizacion(docsClienteId, doc.id, e.target.value)} style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: `1.5px solid ${color}`, color, fontWeight: 700, fontSize: '0.75rem', background: color + '15', cursor: 'pointer' }}>
                          {['Cotizado','Notificado','Pagado','Facturado','Vencido'].map(est => <option key={est} value={est}>{est}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                          {doc.base64 && <button onClick={() => descargarDocumento(doc)} className="btn btn-secondary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}>⬇️</button>}
                          <button onClick={() => eliminarDocumento(docsClienteId, doc.id)} style={{ width: '30px', height: '30px', borderRadius: '7px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: '1rem', fontSize: '0.73rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                💾 Documentos guardados localmente · Máx. recomendado: 3MB por archivo
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal Generar Cotización ─────────────────────── */}
      {showGenCotModal && genCotCliente && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowGenCotModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>✏️ Generar Cotización — {genCotCliente.nombre}</h2>
              <button className="close-btn" onClick={() => setShowGenCotModal(false)}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Válida por (días)</label>
                <input type="number" value={cotValidez} onChange={e => setCotValidez(parseInt(e.target.value)||30)} min="1" max="365" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.1rem' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Vence: <strong>{new Date(Date.now() + cotValidez*86400000).toLocaleDateString('es-DO')}</strong>
                </div>
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Líneas de servicio</label>
                <button type="button" onClick={agregarItemCot} className="btn btn-secondary" style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}>+ Agregar línea</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '240px', overflowY: 'auto' }}>
                {cotItems.map((it, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 30px', gap: '0.4rem', alignItems: 'center' }}>
                    <input type="text" value={it.descripcion} onChange={e => actualizarItemCot(i,'descripcion',e.target.value)} placeholder="Descripción del servicio..." style={{ padding: '0.45rem 0.7rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }} />
                    <input type="number" value={it.cantidad} onChange={e => actualizarItemCot(i,'cantidad',e.target.value)} min="1" placeholder="Cant." style={{ padding: '0.45rem 0.5rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface2)', color: 'var(--text)', textAlign: 'center', fontFamily: 'var(--mono)' }} />
                    <input type="number" value={it.precio} onChange={e => actualizarItemCot(i,'precio',e.target.value)} placeholder="Precio" style={{ padding: '0.45rem 0.5rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface2)', color: 'var(--text)', textAlign: 'right', fontFamily: 'var(--mono)' }} />
                    {cotItems.length > 1 && <button type="button" onClick={() => eliminarItemCot(i)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>×</button>}
                  </div>
                ))}
              </div>
              {/* Subtotales */}
              {(() => {
                const sub = cotItems.reduce((s,it) => s + (parseFloat(it.precio)||0)*(parseFloat(it.cantidad)||1), 0);
                const tax = sub * 0.18;
                return (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--surface2)', borderRadius: '9px', display: 'flex', justifyContent: 'flex-end', gap: '1.5rem', fontSize: '0.83rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Subtotal: <strong>${sub.toLocaleString('en-US',{minimumFractionDigits:2})}</strong></span>
                    <span style={{ color: 'var(--text-muted)' }}>ITBIS 18%: <strong>${tax.toLocaleString('en-US',{minimumFractionDigits:2})}</strong></span>
                    <span style={{ color: 'var(--navy)', fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--mono)' }}>Total: ${(sub+tax).toLocaleString('en-US',{minimumFractionDigits:2})}</span>
                  </div>
                );
              })()}
            </div>

            <div className="form-group">
              <label>Nota / Condiciones</label>
              <textarea value={cotNota} onChange={e => setCotNota(e.target.value)} rows={2} placeholder="Ej: Precios sujetos a cambio. Tiempo de entrega: 5 días hábiles." />
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowGenCotModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={generarCotizacionPDF}>📄 Generar y Descargar PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Notificar con Documento ───────────────── */}
      {showNotifDocModal && notifDocCliente && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowNotifDocModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>📤 Notificar con Documento — {notifDocCliente.nombre}</h2>
              <button className="close-btn" onClick={() => setShowNotifDocModal(false)}>×</button>
            </div>

            {/* Selector de documento */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Seleccionar documento</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
                {(cotizaciones[notifDocCliente.id] || []).map(doc => (
                  <div key={doc.id} onClick={() => setNotifDocSeleccionado(doc)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.85rem', borderRadius: '9px', border: `2px solid ${notifDocSeleccionado?.id === doc.id ? 'var(--accent)' : 'var(--border)'}`, background: notifDocSeleccionado?.id === doc.id ? 'var(--accent-glow)' : 'var(--surface2)', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <span style={{ fontSize: '1.3rem' }}>{doc.tipo === 'generado' ? '📋' : '📄'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.83rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nombre}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(doc.fecha).toLocaleDateString('es-DO')}{doc.monto && ` · $${parseFloat(doc.monto).toLocaleString('en-US',{maximumFractionDigits:2})}`}</div>
                    </div>
                    {notifDocSeleccionado?.id === doc.id && <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '1rem' }}>✓</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Mensaje */}
            <div className="form-group">
              <label>Mensaje de WhatsApp</label>
              <textarea value={notifDocMensaje} onChange={e => setNotifDocMensaje(e.target.value)} rows={6} />
            </div>

            {/* Instrucción visual */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '9px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#78350f' }}>
              <strong>📋 ¿Cómo funciona?</strong>
              <ol style={{ marginTop: '0.35rem', paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                <li>El PDF se <strong>descargará automáticamente</strong> a tu computadora</li>
                <li>Se abrirá <strong>WhatsApp Web</strong> con el mensaje listo</li>
                <li>Solo <strong>adjunta el PDF descargado</strong> al chat y envía</li>
              </ol>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowNotifDocModal(false)}>Cancelar</button>
              <button className="btn btn-success" onClick={enviarNotifConDocumento} disabled={!notifDocSeleccionado || !notifDocCliente?.contacto}>
                🟢 Descargar PDF y abrir WhatsApp
              </button>
            </div>
            {!notifDocCliente?.contacto && <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.5rem' }}>⚠️ Este cliente no tiene número de contacto registrado</div>}
          </div>
        </div>
      )}

      {/* Modal Tags */}
      {showTagModal && tagClienteId && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowTagModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>🏷️ Etiquetas — {clientes.find(c => c.id === tagClienteId)?.nombre}</h2>
              <button className="close-btn" onClick={() => setShowTagModal(false)}>×</button>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Etiquetas predefinidas</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {TAG_PREDEFINIDOS.map(tag => {
                  const activa = (tags[tagClienteId] || []).includes(tag);
                  return <button key={tag} onClick={() => activa ? eliminarTag(tagClienteId, tag) : agregarTag(tagClienteId, tag)} style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', border: `1px solid ${activa ? 'var(--accent)' : 'var(--border2)'}`, background: activa ? 'var(--accent)' : 'var(--surface2)', color: activa ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>{activa ? '✓ ' : '+ '}{tag}</button>;
                })}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Etiqueta personalizada</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Escribir etiqueta..." onKeyDown={e => { if (e.key === 'Enter') { agregarTag(tagClienteId, tagInput); setTagInput(''); } }} style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid var(--border2)', borderRadius: '8px', background: 'var(--surface2)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }} />
                <button onClick={() => { agregarTag(tagClienteId, tagInput); setTagInput(''); }} className="btn btn-primary">Agregar</button>
              </div>
            </div>
            {(tags[tagClienteId] || []).length > 0 && (
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Etiquetas actuales</div>
                <div className="tags-wrap">
                  {(tags[tagClienteId] || []).map(tag => <span key={tag} className={`tag-chip ${TAG_CLASSES[tag] || 'default'}`} onClick={() => eliminarTag(tagClienteId, tag)}>{tag} <span className="tag-x">×</span></span>)}
                </div>
              </div>
            )}
            <div className="form-actions"><button className="btn btn-secondary" onClick={() => setShowTagModal(false)}>Cerrar</button></div>
          </div>
        </div>
      )}

      {/* Modal Configuración */}
      {/* ── Settings Panel — Claude style ── */}
      {showSettingsPanel && (
        <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSettingsPanel(false); }}>
          <div className="settings-panel">
            {/* Left nav */}
            <div className="settings-sidebar">
              <div className="settings-sidebar-title">Configuración</div>
              <button className={`settings-nav-item ${settingsSection === 'config' ? 'active' : ''}`} onClick={() => setSettingsSection('config')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Preferencias
              </button>
              {esAdmin && (
                <button className={`settings-nav-item ${settingsSection === 'usuarios' ? 'active' : ''}`} onClick={() => setSettingsSection('usuarios')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Usuarios
                </button>
              )}
              {esAdmin && (
                <button className={`settings-nav-item ${settingsSection === 'auditoria' ? 'active' : ''}`} onClick={() => setSettingsSection('auditoria')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Auditoría
                </button>
              )}
              <button className="settings-nav-item" style={{ marginTop: 'auto', color: 'var(--danger)', opacity: 0.8 }} onClick={() => { window._manualLogout = true; setShowSettingsPanel(false); signOut({ callbackUrl: '/' }); setTimeout(() => { window.location.href = '/'; }, 500); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Cerrar sesión
              </button>
            </div>

            {/* Right content */}
            <div className="settings-content">
              {settingsSection === 'config' && (<>
                <div className="settings-content-header">
                  <div className="settings-content-title">Preferencias</div>
                  <button className="settings-close-btn" onClick={() => setShowSettingsPanel(false)}>×</button>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>🎨 Apariencia</div>
                  <div className="settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>🎨</div>
                      <div><div className="settings-row-label">Color de acento</div><div className="settings-row-desc">Color principal de la interfaz</div></div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {['#635bff','#0284c7','#059669','#dc2626','#f97316','#8b5cf6','#14b8a6','#e11d48','#0f172a'].map(c => (
                        <div key={c} onClick={() => setColorAcento(c)} style={{ width: '22px', height: '22px', borderRadius: '50%', background: c, cursor: 'pointer', border: colorAcento === c ? '3px solid white' : '2px solid transparent', boxShadow: colorAcento === c ? `0 0 0 2px ${c}` : 'none', transition: 'all 0.15s' }}></div>
                      ))}
                      <input type="color" value={colorAcento} onChange={e => setColorAcento(e.target.value)} style={{ width: '22px', height: '22px', borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 }} title="Color personalizado" />
                    </div>
                  </div>
                  <div className="settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>{darkMode ? '🌙' : '☀️'}</div>
                      <div><div className="settings-row-label">Modo oscuro</div><div className="settings-row-desc">{darkMode ? 'Tema oscuro activo' : 'Tema claro activo'}</div></div>
                    </div>
                    <div className="settings-toggle" onClick={() => setDarkMode(m => !m)} style={{ background: darkMode ? 'var(--brand)' : 'var(--border-2)' }}>
                      <div className="settings-toggle-thumb" style={{ left: darkMode ? '21px' : '3px' }}></div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>⊟</div>
                      <div><div className="settings-row-label">Modo compacto</div><div className="settings-row-desc">Reduce el tamaño de filas en la tabla</div></div>
                    </div>
                    <div className="settings-toggle" onClick={() => setModoCompacto(m => !m)} style={{ background: modoCompacto ? 'var(--brand)' : 'var(--border-2)' }}>
                      <div className="settings-toggle-thumb" style={{ left: modoCompacto ? '21px' : '3px' }}></div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>🔔 Notificaciones</div>
                  <div className="settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>⏰</div>
                      <div><div className="settings-row-label">Alerta de créditos</div><div className="settings-row-desc">Alertar cuando falten N días o menos para vencer</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="number" value={recordatoriosDias} onChange={e => setRecordatoriosDias(parseInt(e.target.value) || 7)} min="1" max="30" style={{ width: '56px', padding: '0.35rem 0.5rem', border: '1px solid var(--border-2)', borderRadius: '7px', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'var(--mono)', textAlign: 'center' }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>días</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>🎯 Objetivos</div>
                  <div className="settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>💰</div>
                      <div><div className="settings-row-label">Meta mensual</div><div className="settings-row-desc">Objetivo de cobros del mes en curso</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>RD$</span>
                      <input type="number" value={metaMensual || ''} onChange={e => setMetaMensual(parseFloat(e.target.value) || 0)} placeholder="0" style={{ width: '100px', padding: '0.35rem 0.5rem', border: '1px solid var(--border-2)', borderRadius: '7px', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'var(--mono)' }} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setShowSettingsPanel(false); showToast('✅ Configuración guardada', 'success'); }}>Guardar cambios</button>
                </div>
              </>)}

              {settingsSection === 'usuarios' && esAdmin && (<>
                <div className="settings-content-header">
                  <div className="settings-content-title">Gestión de usuarios</div>
                  <button className="settings-close-btn" onClick={() => setShowSettingsPanel(false)}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {Object.entries(usuarios).map(([uname, u]) => (
                    <div key={uname} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--surface-2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--brand-bg)', border: '1px solid var(--brand-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', color: 'var(--brand)', flexShrink: 0 }}>{uname.charAt(0)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>{u.nombre || uname}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{uname} · <span style={{ color: u.rol === 'admin' ? 'var(--brand)' : 'var(--text-light)', fontWeight: 600 }}>{u.rol}</span></div>
                      </div>
                      <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }} onClick={() => { setShowSettingsPanel(false); setUsuarioEditando(uname); setUsuarioForm({ username: uname, nombre: u.nombre || '', pass: '', rol: u.rol || 'viewer' }); setShowUsuariosModal(true); }}>Editar</button>
                    </div>
                  ))}
                  <button className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={() => { setShowSettingsPanel(false); setUsuarioEditando(null); setUsuarioForm({ username:'', nombre:'', pass:'', rol:'viewer' }); setShowUsuariosModal(true); }}>Agregar usuario</button>
                </div>
              </>)}

              {settingsSection === 'auditoria' && esAdmin && (<>
                <div className="settings-content-header">
                  <div className="settings-content-title">Auditoría</div>
                  <button className="settings-close-btn" onClick={() => setShowSettingsPanel(false)}>×</button>
                </div>
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Ver el registro completo de actividad del sistema</div>
                  <button className="btn btn-primary" onClick={() => { setShowSettingsPanel(false); abrirAuditLog(); }}>Abrir bitácora de auditoría</button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowConfigModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Configuración del Sistema</h2>
              <button className="close-btn" onClick={() => setShowConfigModal(false)}>×</button>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfigModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Gestión de Usuarios ───────────────────── */}
      {showUsuariosModal && esAdmin && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) { setShowUsuariosModal(false); setUsuarioEditando(null); setUsuarioForm({ username:'', nombre:'', pass:'', rol:'viewer' }); } }}>
          <div className="modal-content" style={{ maxWidth: '620px' }}>
            <div className="modal-header" style={{ borderBottom:'1px solid var(--border)', paddingBottom:'1rem', marginBottom:'1.25rem' }}>
              <div>
                <h2 style={{ fontSize:'1.1rem', fontWeight:700, margin:0, display:'flex', alignItems:'center', gap:'0.6rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Gestión de Usuarios
                </h2>
                <p style={{ margin:'0.2rem 0 0', fontSize:'0.75rem', color:'var(--text-muted)' }}>{Object.keys(usuarios).length} usuario{Object.keys(usuarios).length !== 1 ? 's' : ''} registrado{Object.keys(usuarios).length !== 1 ? 's' : ''}</p>
              </div>
              <button className="close-btn" onClick={() => { setShowUsuariosModal(false); setUsuarioEditando(null); setUsuarioForm({ username:'', nombre:'', pass:'', rol:'viewer' }); }}>×</button>
            </div>

            {/* Formulario crear/editar */}
            <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'12px', padding:'1.25rem', marginBottom:'1.25rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1rem', paddingBottom:'0.75rem', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:'6px', height:'6px', borderRadius:'50%', background: usuarioEditando ? '#f97316' : 'var(--brand)' }}></div>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                  {usuarioEditando ? `Editando · ${usuarioEditando}` : 'Nuevo usuario'}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.6rem', marginBottom:'0.6rem' }}>
                <div className="form-group" style={{ margin:0 }}>
                  <label>Usuario <span style={{ color:'var(--danger)', fontSize:'0.7rem' }}>*</span></label>
                  <input
                    type="text"
                    value={usuarioForm.username}
                    onChange={e => setUsuarioForm(p => ({ ...p, username: e.target.value.toUpperCase() }))}
                    placeholder="Ej: JPEREZ"
                    disabled={!!usuarioEditando}
                    style={{ textTransform:'uppercase', opacity: usuarioEditando ? 0.6 : 1 }}
                  />
                </div>
                <div className="form-group" style={{ margin:0 }}>
                  <label>Nombre completo</label>
                  <input type="text" value={usuarioForm.nombre} onChange={e => setUsuarioForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Juan Pérez" />
                </div>
                <div className="form-group" style={{ margin:0 }}>
                  <label>
                    Contraseña {!usuarioEditando && <span style={{ color:'var(--danger)', fontSize:'0.7rem' }}>*</span>}
                    {usuarioEditando && <span style={{ color:'var(--text-muted)', fontSize:'0.68rem' }}>(vacío = no cambiar)</span>}
                  </label>
                  <div style={{ position:'relative' }}>
                    <input
                      type={showPassActual ? 'text' : 'password'}
                      value={usuarioForm.pass}
                      onChange={e => setUsuarioForm(p => ({ ...p, pass: e.target.value }))}
                      placeholder={usuarioEditando ? 'Dejar vacío para no cambiar' : 'Mín. 8 chars, 1 mayúscula, 1 número'}
                      style={{ paddingRight:'2.5rem' }}
                    />
                    <button type="button" onClick={() => setShowPassActual(v => !v)} style={{ position:'absolute', right:'0.5rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:'0.9rem' }}>
                      {showPassActual ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {/* Indicadores de requisitos en tiempo real */}
                  {usuarioForm.pass && (() => {
                    const p = usuarioForm.pass;
                    const ok = (cond) => ({ color: cond ? '#16a34a' : '#dc2626', fontSize:'0.68rem' });
                    return (
                      <div style={{ marginTop:'0.3rem', display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                        <span style={ok(p.length >= 8)}>{'●'} 8+ caracteres</span>
                        <span style={ok(/[A-Z]/.test(p))}>{'●'} Mayúscula</span>
                        <span style={ok(/[0-9]/.test(p))}>{'●'} Número</span>
                      </div>
                    );
                  })()}
                </div>
                <div className="form-group" style={{ margin:0 }}>
                  <label>Rol</label>
                  <select value={usuarioForm.rol} onChange={e => setUsuarioForm(p => ({ ...p, rol: e.target.value }))} style={{ fontWeight:500 }}>
                    <option value="admin">Administrador</option>
                    <option value="editor">Editor</option>
                    <option value="agente_cobro">Agente de Cobro</option>
                    <option value="contabilidad">Contabilidad</option>
                    <option value="supervisor_cobro">Supervisor de Cobro</option>
                    <option value="supervisor_contabilidad">Supervisor de Contabilidad</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
                {usuarioEditando && (
                  <button className="btn btn-secondary" onClick={() => { setUsuarioEditando(null); setUsuarioForm({ username:'', nombre:'', pass:'', rol:'viewer' }); }}>Cancelar</button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={guardarUsuario}
                  disabled={
                    !usuarioForm.username.trim() ||
                    (!usuarioEditando && !usuarioForm.pass) ||
                    !!validarPassUI(usuarioForm.pass)
                  }
                >
                  {usuarioEditando ? '💾 Actualizar usuario' : '➕ Crear usuario'}
                </button>
              </div>
            </div>

            {/* Lista de usuarios */}
            <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.75rem' }}>
              <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--brand)' }}></div>
              <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                Usuarios registrados
              </div>
              <div style={{ marginLeft:'auto', fontSize:'0.72rem', color:'var(--text-muted)', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'20px', padding:'0.1rem 0.6rem', fontWeight:600 }}>
                {Object.keys(usuarios).length}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem', maxHeight:'280px', overflowY:'auto' }}>
              {Object.entries(usuarios).map(([key, u]) => (
                <div key={key} style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:'0.75rem', alignItems:'center', padding:'0.75rem 1rem', background:'var(--surface)', border:`2px solid ${key === currentUser ? 'var(--accent)' : 'var(--border)'}`, borderRadius:'10px' }}>
                  {(() => { const av = getAvatar(u.nombre || key); return <div className="avatar avatar-sm" style={{ background: av.color }}>{av.letra}</div>; })()}
                  <div>
                    <div style={{ fontWeight:700, fontSize:'0.88rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      {key}
                      {key === currentUser && <span style={{ background:'var(--accent)', color:'white', borderRadius:'20px', padding:'0.1rem 0.5rem', fontSize:'0.65rem', fontWeight:800 }}>TÚ</span>}
                      {(() => {
                        const ROL_LABEL = { admin: 'Admin', editor: 'Editor', agente_cobro: 'Agente Cobro', contabilidad: 'Contabilidad', supervisor_cobro: 'Sup. Cobro', supervisor_contabilidad: 'Sup. Contabilidad', viewer: 'Viewer' };
                        const esOp = ['editor','agente_cobro','contabilidad','supervisor_cobro','supervisor_contabilidad'].includes(u.rol);
                        const bg = u.rol==='admin' ? '#fef9c3' : esOp ? '#f0fdf4' : '#f0f9ff';
                        const bd = u.rol==='admin' ? '#fde047' : esOp ? '#86efac' : '#bae6fd';
                        const cl = u.rol==='admin' ? '#713f12' : esOp ? '#166534' : '#075985';
                        return <span style={{ background:bg, border:`1px solid ${bd}`, borderRadius:'20px', padding:'0.1rem 0.5rem', fontSize:'0.68rem', fontWeight:700, color:cl }}>{ROL_LABEL[u.rol] || u.rol}</span>;
                      })()}
                    </div>
                    <div style={{ fontSize:'0.73rem', color:'var(--text-muted)' }}>{u.nombre || '—'}</div>
                  </div>
                  <div style={{ display:'flex', gap:'0.35rem' }}>
                    <button onClick={() => editarUsuario(key)} style={{ padding:'0.25rem 0.6rem', border:'1px solid var(--border2)', borderRadius:'6px', background:'var(--surface2)', cursor:'pointer', fontSize:'0.78rem' }}>✏️</button>
                    {key !== currentUser && (
                      <button onClick={() => eliminarUsuario(key)} style={{ padding:'0.25rem 0.6rem', border:'1px solid #fca5a5', borderRadius:'6px', background:'#fee2e2', color:'#dc2626', cursor:'pointer', fontSize:'0.78rem' }}>🗑️</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:'1rem', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:'9px', padding:'0.75rem 1rem', fontSize:'0.78rem', color:'#075985' }}>
              <strong>Roles:</strong>
              <ul style={{ marginTop:'0.3rem', paddingLeft:'1.2rem', lineHeight:1.8 }}>
                <li><strong>Administrador</strong> — acceso total: clientes, créditos, usuarios y auditoría</li>
                <li><strong>Editor</strong> — puede crear, editar y eliminar clientes y créditos; sin acceso a usuarios ni auditoría</li>
                <li><strong>Viewer</strong> — solo puede ver la información, sin modificar nada</li>
              </ul>
              <div style={{ marginTop:'0.5rem', color:'#059669', fontWeight:600 }}>✅ Los usuarios se guardan en el servidor — cualquier computadora puede acceder con sus credenciales.</div>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => { setShowUsuariosModal(false); setUsuarioEditando(null); setUsuarioForm({ username:'', nombre:'', pass:'', rol:'viewer' }); }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Auditoría de Seguridad ─────────────────── */}
      {showAuditModal && esAdmin && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowAuditModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '820px' }}>
            <div className="modal-header">
              <h2>🔍 Bitácora de Seguridad</h2>
              <button className="close-btn" onClick={() => setShowAuditModal(false)}>×</button>
            </div>

            {/* Filtro */}
            <div style={{ display:'flex', gap:'0.6rem', marginBottom:'1rem', alignItems:'center' }}>
              <input
                type="text"
                value={auditFilter}
                onChange={e => setAuditFilter(e.target.value)}
                placeholder="Filtrar por usuario, IP, acción..."
                style={{ flex:1, padding:'0.5rem 0.8rem', border:'1px solid var(--border)', borderRadius:'8px', background:'var(--surface2)', color:'var(--text)', fontSize:'0.82rem' }}
              />
              <button onClick={abrirAuditLog} className="btn btn-secondary" style={{ whiteSpace:'nowrap' }}>🔄 Actualizar</button>
              <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                {auditLoading ? 'Cargando...' : `${auditEntries.length} registros`}
              </span>
            </div>

            {/* Leyenda */}
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.75rem', fontSize:'0.68rem' }}>
              {[['🟢','Login OK','#dcfce7','#15803d'],['🔴','Login Fail','#fee2e2','#dc2626'],['➕','Creado','#eff6ff','#1d4ed8'],['✏️','Actualizado','#fef9c3','#92400e'],['🗑️','Eliminado','#fce7f3','#be185d'],['🚫','Acceso Denegado','#fef2f2','#991b1b'],['⛔','CSRF','#fef2f2','#7f1d1d'],['⏱️','Rate Limit','#fff7ed','#c2410c']].map(([ico,lbl,bg,col]) => (
                <span key={lbl} style={{ background:bg, color:col, padding:'0.15rem 0.45rem', borderRadius:'6px', fontWeight:600 }}>{ico} {lbl}</span>
              ))}
            </div>

            {/* Lista de eventos */}
            <div style={{ maxHeight:'420px', overflowY:'auto', fontFamily:'monospace', fontSize:'0.73rem', background:'#0f172a', borderRadius:'10px', padding:'0.75rem', color:'#e2e8f0' }}>
              {auditLoading && <div style={{ textAlign:'center', color:'#94a3b8', padding:'2rem' }}>Cargando registros...</div>}
              {!auditLoading && auditEntries.length === 0 && (
                <div style={{ textAlign:'center', color:'#64748b', padding:'2rem' }}>No hay registros de auditoría todavía.</div>
              )}
              {!auditLoading && auditEntries
                .filter(l => !auditFilter || l.toLowerCase().includes(auditFilter.toLowerCase()))
                .map((line, i) => {
                  const isOk   = line.includes('LOGIN_OK');
                  const isFail = line.includes('LOGIN_FAIL') || line.includes('ACCESS_DENY') || line.includes('CSRF') || line.includes('RATE_BLOCK');
                  const isCreate = line.includes('USER_CREATE');
                  const isDel    = line.includes('USER_DELETE');
                  const color = isOk ? '#86efac' : isFail ? '#fca5a5' : isCreate ? '#93c5fd' : isDel ? '#f9a8d4' : '#e2e8f0';
                  return (
                    <div key={i} style={{ color, marginBottom:'0.25rem', borderBottom:'1px solid #1e293b', paddingBottom:'0.2rem', lineHeight:1.5, wordBreak:'break-all' }}>
                      {line}
                    </div>
                  );
                })
              }
            </div>

            <div style={{ marginTop:'0.75rem', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'9px', padding:'0.65rem 1rem', fontSize:'0.75rem', color:'#166534' }}>
              <strong>🔒 Información:</strong> Estos registros son de solo lectura. Cada acción queda registrada con fecha, hora, usuario e IP.
              El archivo <code>data/audit.log</code> se guarda en el servidor y no puede ser alterado desde el sistema.
            </div>

            <div className="form-actions" style={{ marginTop:'0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowAuditModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Bitácora de Gestión ───────────────────── */}
      {showGestionModal && gestionClienteId && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowGestionModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>📞 Registrar Gestión — {clientes.find(c=>c.id===gestionClienteId)?.nombre}</h2>
              <button className="close-btn" onClick={() => setShowGestionModal(false)}>×</button>
            </div>

            {/* Historial reciente */}
            {(gestiones[gestionClienteId]||[]).length > 0 && (
              <div style={{ marginBottom:'1rem', maxHeight:'150px', overflowY:'auto' }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'0.4rem' }}>Historial reciente</div>
                {(gestiones[gestionClienteId]||[]).slice(0,5).map(g => (
                  <div key={g.id} style={{ display:'flex', gap:'0.6rem', alignItems:'flex-start', padding:'0.45rem 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontSize:'0.8rem' }}>{g.tipo==='Llamada'?'📞':g.tipo==='WhatsApp'?'💬':g.tipo==='Visita'?'🚗':g.tipo==='Email'?'📧':'📌'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <span style={{ fontSize:'0.78rem', fontWeight:700, color: COLOR_RESULTADO[g.resultado]||'var(--text)' }}>{g.resultado}</span>
                      <span style={{ fontSize:'0.73rem', color:'var(--text-muted)', marginLeft:'0.4rem' }}>{new Date(g.fecha).toLocaleDateString('es-DO')}</span>
                      {g.nota && <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.nota}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'0.75rem' }}>
              <div className="form-group" style={{ margin:0 }}>
                <label>Tipo de gestión</label>
                <select value={gestionTipo} onChange={e => setGestionTipo(e.target.value)}>
                  {TIPOS_GESTION.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label>Resultado</label>
                <select value={gestionResultado} onChange={e => setGestionResultado(e.target.value)}>
                  {RESULTADOS_GESTION.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Nota (opcional)</label>
              <textarea value={gestionNota} onChange={e => setGestionNota(e.target.value)} rows={2} placeholder="Ej: Dijo que paga el viernes, comunicarse el lunes..." />
            </div>
            <div className="form-group">
              <label>📅 Próximo seguimiento (opcional)</label>
              <input type="date" value={gestionProximaFecha} onChange={e => setGestionProximaFecha(e.target.value)} min={new Date().toISOString().split('T')[0]} />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowGestionModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarGestion}>✅ Guardar Gestión</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal WhatsApp Masivo ────────────────────────── */}
      {showWaMasivoModal && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget && !waMasivoActivo) { setShowWaMasivoModal(false); } }}>
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h2>📱 WhatsApp Masivo — {clientesSeleccionados.length} clientes</h2>
              <button className="close-btn" onClick={() => !waMasivoActivo && setShowWaMasivoModal(false)}>×</button>
            </div>

            {/* Clientes destino */}
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'0.4rem' }}>Destinatarios</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', maxHeight:'80px', overflowY:'auto' }}>
                {clientes.filter(c => clientesSeleccionados.includes(c.id)).map(c => (
                  <span key={c.id} style={{ background: c.contacto ? '#f0fdf4' : '#fef2f2', border:`1px solid ${c.contacto ? '#86efac' : '#fca5a5'}`, borderRadius:'20px', padding:'0.15rem 0.6rem', fontSize:'0.75rem', fontWeight:600, color: c.contacto ? '#15803d' : '#dc2626' }}>
                    {c.nombre}{!c.contacto ? ' ⚠️' : ''}
                  </span>
                ))}
              </div>
              {clientes.filter(c => clientesSeleccionados.includes(c.id) && !c.contacto).length > 0 && (
                <div style={{ fontSize:'0.72rem', color:'#dc2626', marginTop:'0.3rem' }}>⚠️ Los clientes en rojo no tienen número y serán omitidos</div>
              )}
            </div>

            {/* Plantillas rápidas */}
            {plantillas.length > 0 && (
              <div style={{ marginBottom:'0.75rem' }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'0.4rem' }}>Usar plantilla</div>
                <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap' }}>
                  {plantillas.map(p => (
                    <button key={p.id} onClick={() => setWaMasivoMensaje(p.texto)} style={{ padding:'0.25rem 0.65rem', borderRadius:'20px', border:'1px solid var(--border2)', background:'var(--surface2)', color:'var(--text)', fontSize:'0.75rem', cursor:'pointer', fontWeight:600 }}>{p.nombre}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Mensaje <span style={{ fontWeight:400, color:'var(--text-muted)' }}>— usa {'{nombre}'}, {'{monto}'}, {'{estado}'}</span></label>
              <textarea value={waMasivoMensaje} onChange={e => setWaMasivoMensaje(e.target.value)} rows={5} placeholder="Estimado/a {nombre}, le recordamos su cuenta pendiente por RD${monto}..." />
            </div>

            {waMasivoActivo && (
              <div style={{ textAlign:'center', padding:'0.75rem', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'9px', marginBottom:'0.75rem', fontWeight:700, color:'#15803d' }}>
                Enviando {waMasivoIndex} de {clientes.filter(c => clientesSeleccionados.includes(c.id) && c.contacto).length}...
              </div>
            )}

            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'9px', padding:'0.65rem 0.9rem', marginBottom:'1rem', fontSize:'0.78rem', color:'#78350f' }}>
              💡 Se abrirá WhatsApp Web para cada cliente con su mensaje personalizado. Los nombres y montos se reemplazarán automáticamente.
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => !waMasivoActivo && setShowWaMasivoModal(false)} disabled={waMasivoActivo}>Cancelar</button>
              <button className="btn btn-primary" style={{ background:'#25d366' }} onClick={enviarWaMasivo} disabled={!waMasivoMensaje.trim() || waMasivoActivo}>
                🟢 Enviar a {clientes.filter(c => clientesSeleccionados.includes(c.id) && c.contacto).length} clientes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Plantillas WhatsApp ────────────────────── */}
      {showPlantillasModal && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowPlantillasModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <h2>💬 Plantillas de WhatsApp</h2>
              <button className="close-btn" onClick={() => setShowPlantillasModal(false)}>×</button>
            </div>

            {/* Editor */}
            <div style={{ background:'var(--surface2)', borderRadius:'12px', padding:'1rem', marginBottom:'1rem', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'0.5rem' }}>{plantillaEditando ? '✏️ Editando plantilla' : '➕ Nueva plantilla'}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'0.5rem', marginBottom:'0.5rem' }}>
                <input type="text" value={plantillaForm.nombre} onChange={e => setPlantillaForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre de la plantilla" style={{ padding:'0.5rem 0.7rem', border:'1px solid var(--border2)', borderRadius:'7px', background:'var(--surface)', color:'var(--text)', fontSize:'0.83rem', fontFamily:'Plus Jakarta Sans, sans-serif' }} />
                <input type="text" value={plantillaForm.texto} onChange={e => setPlantillaForm(p=>({...p,texto:e.target.value}))} placeholder="Texto… usa {nombre}, {monto}, {estado}" style={{ padding:'0.5rem 0.7rem', border:'1px solid var(--border2)', borderRadius:'7px', background:'var(--surface)', color:'var(--text)', fontSize:'0.83rem', fontFamily:'Plus Jakarta Sans, sans-serif' }} />
              </div>
              <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
                {plantillaEditando && <button className="btn btn-secondary" onClick={() => { setPlantillaEditando(null); setPlantillaForm({nombre:'',texto:''}); }}>Cancelar</button>}
                <button className="btn btn-primary" onClick={guardarPlantilla} disabled={!plantillaForm.nombre.trim() || !plantillaForm.texto.trim()}>{plantillaEditando ? '💾 Actualizar' : '➕ Agregar'}</button>
              </div>
            </div>

            {/* Lista de plantillas */}
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', maxHeight:'340px', overflowY:'auto' }}>
              {plantillas.map(p => (
                <div key={p.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.75rem 1rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.3rem' }}>
                    <span style={{ fontWeight:700, fontSize:'0.88rem' }}>{p.nombre}</span>
                    <div style={{ display:'flex', gap:'0.35rem' }}>
                      <button onClick={() => { setPlantillaEditando(p.id); setPlantillaForm({nombre:p.nombre,texto:p.texto}); }} style={{ padding:'0.2rem 0.55rem', border:'1px solid var(--border2)', borderRadius:'6px', background:'var(--surface2)', cursor:'pointer', fontSize:'0.75rem' }}>✏️</button>
                      <button onClick={() => eliminarPlantilla(p.id)} style={{ padding:'0.2rem 0.55rem', border:'1px solid #fca5a5', borderRadius:'6px', background:'#fee2e2', color:'#dc2626', cursor:'pointer', fontSize:'0.75rem' }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', lineHeight:1.5 }}>{p.texto}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:'0.75rem', fontSize:'0.73rem', color:'var(--text-muted)' }}>
              💡 Variables: <code>{'{nombre}'}</code> <code>{'{monto}'}</code> <code>{'{estado}'}</code> — se reemplazan automáticamente por los datos del cliente
            </div>
            <div className="form-actions"><button className="btn btn-secondary" onClick={() => setShowPlantillasModal(false)}>Cerrar</button></div>
          </div>
        </div>
      )}

      {/* ── Modal Carga Masiva ────────────────────────────── */}
      {showCargaMasivaModal && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) { setShowCargaMasivaModal(false); setArchivosEnProceso([]); } }}>
          <div className="modal-content" style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <h2>📂 Carga Masiva de Documentos</h2>
              <button className="close-btn" onClick={() => { setShowCargaMasivaModal(false); setArchivosEnProceso([]); }}>×</button>
            </div>

            {archivosEnProceso.length === 0 ? (
              /* ── Zona de carga ── */
              <div>
                <label
                  style={{ display: 'block', border: '2px dashed var(--border2)', borderRadius: '14px', padding: '2.5rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--surface2)' }}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-glow)'; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; procesarArchivosMasivos(e.dataTransfer.files); }}
                >
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📁</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)', marginBottom: '0.35rem' }}>Arrastra los PDFs aquí o haz clic para seleccionar</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Hasta 50 archivos · Máx. 3MB por archivo · Solo .pdf</div>
                  <input type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={e => { procesarArchivosMasivos(e.target.files); e.target.value = ''; }} />
                  <span className="btn btn-primary" style={{ pointerEvents: 'none', fontSize: '0.85rem' }}>Seleccionar archivos</span>
                </label>
                {cargaMasivaProcesando && (
                  <div style={{ textAlign: 'center', marginTop: '1.25rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>⏳ Procesando archivos, un momento...</div>
                )}
                <div style={{ marginTop: '1.25rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '0.85rem 1.1rem', fontSize: '0.8rem', color: '#15803d' }}>
                  <strong>💡 ¿Cómo funciona la detección automática?</strong>
                  <ul style={{ marginTop: '0.4rem', paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                    <li>Si el nombre del archivo contiene el <strong>ID numérico</strong> del cliente (ej: <em>cotizacion_42.pdf</em>) → vinculación automática</li>
                    <li>Si contiene el <strong>nombre completo</strong> del cliente (ej: <em>Juan_Perez_cotizacion.pdf</em>) → vinculación automática</li>
                    <li>Si coincide <strong>parcialmente</strong> → sugerido (puedes confirmar o cambiar)</li>
                    <li>Sin coincidencia → puedes asignarlo manualmente desde la lista</li>
                    <li>Si el PDF contiene <strong>Total RD$</strong>, el monto se detecta automáticamente y se actualiza en el cliente</li>
                  </ul>
                </div>
              </div>
            ) : (
              /* ── Resultados ── */
              <div>
                {/* Resumen badges */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {[
                    { label: 'Vinculados', count: archivosEnProceso.filter(a => a.estado === 'vinculado').length, color: '#059669', bg: '#f0fdf4', border: '#86efac', icon: '✅' },
                    { label: 'Sugeridos', count: archivosEnProceso.filter(a => a.estado === 'sugerido').length, color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '⚠️' },
                    { label: 'Sin vincular', count: archivosEnProceso.filter(a => a.estado === 'sin-vincular').length, color: '#6b7280', bg: 'var(--surface2)', border: 'var(--border)', icon: '❓' },
                    { label: 'Errores', count: archivosEnProceso.filter(a => a.estado === 'error').length, color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '❌' },
                  ].filter(b => b.count > 0).map(b => (
                    <span key={b.label} style={{ background: b.bg, border: `1px solid ${b.border}`, padding: '0.3rem 0.85rem', borderRadius: '20px', fontSize: '0.77rem', fontWeight: 700, color: b.color }}>
                      {b.icon} {b.label}: {b.count}
                    </span>
                  ))}
                  {archivosEnProceso.filter(a => a.montoDetectado).length > 0 && (
                    <span style={{ background: '#e0f2fe', border: '1px solid #bae6fd', padding: '0.3rem 0.85rem', borderRadius: '20px', fontSize: '0.77rem', fontWeight: 700, color: '#0369a1' }}>
                      💰 Con monto: {archivosEnProceso.filter(a => a.montoDetectado).length}
                    </span>
                  )}
                  <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.3rem 0.85rem', borderRadius: '20px', fontSize: '0.77rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Total: {archivosEnProceso.length}
                  </span>
                </div>

                {/* Tabla de archivos */}
                <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.2rem' }}>
                  {archivosEnProceso.map((arch, idx) => (
                    <div key={arch.id || idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.65rem 0.9rem', background: arch.estado === 'vinculado' ? '#f0fdf4' : arch.estado === 'sugerido' ? '#fffbeb' : arch.estado === 'error' ? '#fef2f2' : 'var(--surface2)', borderRadius: '9px', border: `1px solid ${arch.estado === 'vinculado' ? '#86efac' : arch.estado === 'sugerido' ? '#fde68a' : arch.estado === 'error' ? '#fca5a5' : 'var(--border)'}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>
                            {arch.estado === 'vinculado' ? '✅' : arch.estado === 'sugerido' ? '⚠️' : arch.estado === 'error' ? '❌' : '❓'}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{arch.nombre}</span>
                        </div>
                        {arch.estado === 'error' ? (
                          <div style={{ fontSize: '0.72rem', color: '#dc2626', paddingLeft: '1.35rem' }}>{arch.error}</div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', paddingLeft: '1.35rem' }}>
                            {arch.clienteDetectado ? (
                              <span style={{ fontSize: '0.72rem', color: arch.estado === 'vinculado' ? '#059669' : '#d97706' }}>
                                {arch.clienteDetectado.razon}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>No se detectó cliente automáticamente</span>
                            )}
                            {arch.montoDetectado ? (
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '20px', padding: '0.1rem 0.5rem' }}>
                                💰 RD${arch.montoDetectado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>sin monto</span>
                            )}
                          </div>
                        )}
                      </div>
                      {arch.estado !== 'error' && (
                        <select
                          value={arch.clienteAsignado?.id || ''}
                          onChange={e => {
                            const c = clientes.find(cl => cl.id === parseInt(e.target.value));
                            setArchivosEnProceso(prev => prev.map((a, i) => i === idx ? { ...a, clienteAsignado: c || null, estado: c ? 'vinculado' : 'sin-vincular' } : a));
                          }}
                          style={{ padding: '0.35rem 0.5rem', border: '1px solid var(--border2)', borderRadius: '7px', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.78rem', minWidth: '170px', maxWidth: '200px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                        >
                          <option value="">— Sin vincular —</option>
                          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '0.6rem', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                  💡 Usa el menú desplegable para asignar o corregir manualmente el cliente de cada archivo
                </div>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => { setShowCargaMasivaModal(false); setArchivosEnProceso([]); }}>Cancelar</button>
              {archivosEnProceso.length > 0 && (
                <button className="btn btn-secondary" onClick={() => setArchivosEnProceso([])}>🔄 Seleccionar otros archivos</button>
              )}
              {archivosEnProceso.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={confirmarCargaMasiva}
                  disabled={archivosEnProceso.every(a => !a.clienteAsignado || !a.base64)}
                >
                  💾 Guardar {archivosEnProceso.filter(a => a.clienteAsignado && a.base64).length} documento{archivosEnProceso.filter(a => a.clienteAsignado && a.base64).length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <div className="mobile-bottom-nav">
        <button className={`mobile-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          <span>Inicio</span>
        </button>
        <button className={`mobile-nav-btn ${activeTab === 'cartera' ? 'active' : ''}`} onClick={() => setActiveTab('cartera')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>
          <span>Cartera</span>
        </button>
        <button className={`mobile-nav-btn ${activeTab === 'credito' ? 'active' : ''}`} onClick={() => setActiveTab('credito')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <span>Crédito</span>
        </button>
        <button className={`mobile-nav-btn ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Agenda</span>
        </button>
        <button className={`mobile-nav-btn ${showMobileMenu ? 'active' : ''}`} onClick={() => setShowMobileMenu(v => !v)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          <span>Más</span>
        </button>
      </div>

      {/* Modal de nueva versión — actualización automática */}
      {nuevaVersion && (
        <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(6px)' }}>
          <div className="modal-content" style={{ maxWidth: '380px', textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🚀</div>
            <h2 style={{ marginBottom: '0.6rem', fontSize: '1.3rem' }}>Nueva versión disponible</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', fontSize: '0.88rem', lineHeight: 1.5 }}>
              El sistema se actualizó con mejoras y arreglos. Cerrando sesión y recargando en 3 segundos...
            </p>
            <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--primary)', animation: 'progressBar 3s linear forwards', borderRadius: '3px' }} />
            </div>
          </div>
        </div>
      )}

      {/* Modal de sesión expirada */}
      {sessionExpired && (
        <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(6px)' }}>
          <div className="modal-content" style={{ maxWidth: '380px', textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⏱️</div>
            <h2 style={{ marginBottom: '0.6rem', fontSize: '1.3rem' }}>Sesión del día expirada</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Por seguridad, tu sesión expira cada 24 horas. Vuelve a iniciar sesión para continuar trabajando.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
              onClick={() => { setSessionExpired(false); signOut({ callbackUrl: '/' }); }}>
              Volver a entrar
            </button>
          </div>
        </div>
      )}

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
