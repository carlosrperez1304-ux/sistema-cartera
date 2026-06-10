'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import TabTickets from './components/TabTickets';
import TabGrupos from './components/TabGrupos';
import { getSupabaseBrowser } from '../lib/supabase-browser.js';
import * as XLSX from 'xlsx';
import { signIn, signOut, useSession } from 'next-auth/react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Pencil, Trash2, Plus, Download, Send, FolderOpen, Save, RefreshCw, CheckCircle, XCircle, AlertTriangle, HelpCircle, Info, Phone, MessageCircle, MapPin, Mail, Pin, DollarSign, ClipboardList, FileText, FileEdit, Archive, Tag, Sun, Moon, Eye, EyeOff, SlidersHorizontal, Clock, Loader2, Inbox, Ban, MessageSquare, BarChart2, Lock, Search, Calendar, Bell, Target, Palette, MoreVertical, Edit2, StickyNote, FileSearch, BookOpen, PauseCircle, PlayCircle, Menu, X, Settings, LogOut, UserPlus, CreditCard, Upload, ChevronDown, LayoutGrid, Users, ArrowLeftRight, List, Check, Briefcase, Rocket, Monitor, Minus, Square, Minimize2, Maximize2, Command, CircleDollarSign } from 'lucide-react';
import COT_PLANTILLAS from '../lib/cotPlantillas.js';

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
  const [auditError, setAuditError]           = useState('');

  // Mobile menu
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Sesión expirada — detectar cuando pasa de authenticated → unauthenticated
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTopbarMenu, setShowTopbarMenu] = useState(false);
  const [whatsappQR, setWhatsappQR] = useState(null);
  const [whatsappConectado, setWhatsappConectado] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [bancoMovimientos, setBancoMovimientos] = useState([]);
  const [bancoArchivoNombre, setBancoArchivoNombre] = useState('');
  const [bancoFiltro, setBancoFiltro] = useState('todos');
  const [bancoFechaDesde, setBancoFechaDesde] = useState('');
  const [bancoFechaHasta, setBancoFechaHasta] = useState('');
  const [historialConciliaciones, setHistorialConciliaciones] = useState([]);
  const [pagosPendientes, setPagosPendientes] = useState([]);
  const [pagosPendientesCount, setPagosPendientesCount] = useState(0);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [pagoRechazandoId, setPagoRechazandoId] = useState(null);
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
  const cargarUsuariosAdmin = () => {
    fetch('/api/usuarios/admin-info').then(r => r.json()).then(data => {
      if (!data.error) setUsuariosAdmin(data);
    }).catch(() => {});
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
  // WhatsApp Baileys listeners
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    window.electronAPI.onWhatsappQR((qr) => {
      setWhatsappQR(qr);
      setWhatsappConectado(false);
    });
    window.electronAPI.onWhatsappStatus((status) => {
      if (status.conectado) {
        setWhatsappConectado(true);
        setWhatsappQR(null);
      } else {
        setWhatsappConectado(false);
      }
    });
    // Verificar estado inicial
    window.electronAPI.whatsappStatus().then(s => {
      if (s?.conectado) setWhatsappConectado(true);
    }).catch(() => {});
  }, []);

  const esAdmin = session
    ? (session.user?.rol === 'admin')
    : (usuarios[currentUser]?.rol === 'admin');
  const ROLES_EDITOR    = ['editor', 'agente_cobro', 'contabilidad', 'supervisor_cobro', 'supervisor_contabilidad'];
  const ROLES_VER_TODO  = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];
  const rolActual       = session ? (session.user?.rol || '') : (usuarios[currentUser]?.rol || '');
  const esEditor        = ROLES_EDITOR.includes(rolActual);
  const puedeVerTodo    = esAdmin || ROLES_VER_TODO.includes(rolActual);
  const soloLectura     = !esAdmin && !esEditor;
  const esContabilidad  = esAdmin || ['contabilidad', 'supervisor_contabilidad'].includes(rolActual);

  const [permisosRol, setPermisosRol] = useState({});
  const tienePermiso = (permiso) => {
    if (esAdmin) return true;
    const permsDeRol = permisosRol[rolActual];
    if (!permsDeRol || permsDeRol[permiso] === undefined) return true;
    return permsDeRol[permiso];
  };

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
        setLoginError((result?.error || 'Usuario o contraseña incorrectos'));
      }
    } catch {
      setLoginError('Error de conexión con el servidor');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('currentUser');
    setUsername('');
    setPassword('');
  };

  const [clientes, setClientes] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [historialMeses, setHistorialMeses] = useState({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session?.user) { setHydrated(true); return; }
    fetch('/api/historial-meses')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const mapa = {};
        (data || []).forEach(r => { mapa[r.mes_key] = r.datos; });
        setHistorialMeses(mapa);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [session?.user, sessionStatus]);

  // — Reloj en tiempo real (usa ref para evitar re-renders globales cada segundo) —
  const clockRef = useRef(null);
  useEffect(() => {
    const actualizar = () => {
      if (!clockRef.current) return;
      const ahora = new Date();
      const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const fecha = ahora.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
      clockRef.current.textContent = `${fecha} · ${hora}`;
    };
    actualizar();
    const interval = setInterval(actualizar, 1000);
    return () => clearInterval(interval);
  }, []);

  // — Versión de la app —
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.getVersion) return;
    window.electronAPI.getVersion().then(v => setAppVersion(v)).catch(() => {});
  }, []);

 // ── Watcher automático de carpeta ────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.electronAPI?.isElectron) return;

    const archivosRecientes = new Set();

    const cleanupPdf = window.electronAPI.onPdfNuevoDetectado?.(async (data) => {
      if (!data?.base64 || !data?.nombre) return;
      if (archivosRecientes.has(data.nombre)) return;
      archivosRecientes.add(data.nombre);
      setTimeout(() => archivosRecientes.delete(data.nombre), 5000);

      const nombreCliente = data.nombreCliente?.toLowerCase().trim() || '';
      const clienteEncontrado = clientes.find(c => {
        const cn = (c.nombre || '').toLowerCase().trim();
        return cn === nombreCliente ||
          cn.includes(nombreCliente) ||
          nombreCliente.includes(cn);
      });

      if (!clienteEncontrado) {
        showToast(`⚠️ No se encontró cliente para: ${data.nombreCliente}`, 'error');
        return;
      }

      try {
        const byteStr = atob(data.base64.split(',')[1]);
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
        const file = new File([bytes], data.nombre, { type: 'application/pdf' });
        await subirDocumento(clienteEncontrado.id, file);
        showToast(`✅ PDF subido a ${clienteEncontrado.nombre}`, 'success');
      } catch (err) {
        showToast('Error subiendo PDF: ' + data.nombre, 'error');
      }
    });

    const cleanupActivo = window.electronAPI.onWatcherActivo?.((data) => {
      showToast(`👁️ Vigilando carpeta: ${data.carpeta}`, 'info');
    });

    window.electronAPI.onAbrirSeleccionarCarpeta?.(() => {
      abrirCargaMasiva();
    });

    return () => {
      cleanupPdf?.();
      cleanupActivo?.();
    };
  }, [clientes]);

  // — Auto-update listeners —
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.electronAPI?.isElectron) return;
    window.electronAPI.onUpdateAvailable?.((version) => {
      setUpdateAvailable(true);
      setUpdateVersion(version);
    });
    window.electronAPI.onDownloadProgress?.((percent) => {
      console.log('Progreso:', percent);
      setDownloadProgress(percent);
    });
    window.electronAPI.onUpdateDownloaded?.(() => {
      setUpdateDownloaded(true);
      setDownloading(false);
    });
  }, []);

  // — Notas del dashboard —
  const cargarNotasDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/notas-dashboard');
      if (res.ok) setNotasDashboard(await res.json());
    } catch {}
  }, []);

  const agregarNota = async () => {
    if (!notaInput.trim()) return;
    setNotaLoading(true);
    try {
      const res = await fetch('/api/notas-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'paytrack' },
        body: JSON.stringify({ texto: notaInput.trim() }),
      });
      if (res.ok) {
        const nueva = await res.json();
        setNotasDashboard(prev => [nueva, ...prev]);
        setNotaInput('');
      }
    } catch {}
    setNotaLoading(false);
  };

  const eliminarNota = async (id) => {
    try {
      await fetch(`/api/notas-dashboard?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': 'paytrack' },
      });
      setNotasDashboard(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

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
      const todos = [...mapa.values()];
      setClientes(todos);
      const tagsMapa = {};
      todos.forEach(c => { if (c.tags?.length > 0) tagsMapa[c.id] = c.tags; });
      setTags(prev => ({ ...tagsMapa, ...prev }));
    } catch { /* offline — mantener datos en pantalla */ }
  }, []);

  const cargarCreditos = useCallback(async () => {
    try {
      const res = await fetch('/api/creditos');
      const data = res.ok ? await res.json() : null;
      if (Array.isArray(data)) setCreditos(data);
    } catch { /* offline — mantener datos en pantalla */ }
  }, []);

  // Cierre automático removido — el cierre de mes es manual (solo admin/supervisor)

  // Carga inicial + suscripción Supabase Realtime
  useEffect(() => {
    if (!session?.user) return;

    // Carga inicial de datos
    cargarClientes();
    cargarCreditos();
    cargarNotasDashboard();
    cargarTodosDocumentos();
    if (['contabilidad', 'supervisor_cobro', 'supervisor_contabilidad', 'admin'].includes(session?.user?.rol)) {
      cargarPagosPendientes();
    }

    // Supabase Realtime — reemplaza el setInterval por eventos en tiempo real
    const supabase = getSupabaseBrowser();
    if (!supabase) return; // anon key no configurada — sin realtime

    // Debounce para evitar múltiples cargas simultáneas cuando Realtime
    // dispara ráfagas de eventos (ej: cierre de mes actualiza N clientes a la vez)
    let timerClientes;
    let timerCreditos;
    const debouncedClientes = () => {
      clearTimeout(timerClientes);
      timerClientes = setTimeout(() => cargarClientes(), 600);
    };
    const debouncedCreditos = () => {
      clearTimeout(timerCreditos);
      timerCreditos = setTimeout(() => cargarCreditos(), 600);
    };

    let channel;

    const conectarRealtime = () => {
      if (channel) supabase.removeChannel(channel);

      channel = supabase
        .channel('cartera-realtime')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'clientes' },
          debouncedClientes
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'creditos' },
          debouncedCreditos
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'delegations' },
          () => {
            debouncedClientes();
            debouncedCreditos();
          }
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'config' },
          (payload) => {
            const { clave, valor } = payload.new || {};
            if (clave === 'recordatorio_mes') {
              const hoy = new Date();
              const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
              setRecordatorioActivo(valor === mesActual);
            }
            if (clave === 'recordatorio_mes_enviado') {
              setRecordatorioActivo(false);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
            setTimeout(conectarRealtime, 3000);
          }
        });
    };

    conectarRealtime();

    const pollingInterval = setInterval(() => {
      cargarClientes();
      cargarCreditos();
    }, 30000);

    return () => {
      clearTimeout(timerClientes);
      clearTimeout(timerCreditos);
      clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.username, cargarClientes, cargarCreditos]);

  // Recordatorio día 13 — activa automáticamente basado en la fecha del dispositivo
  useEffect(() => {
    if (!session?.user) return;
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    if (hoy.getDate() >= 13) {
      // Verificar si ya fue enviado este mes
      fetch('/api/config')
        .then(r => r.ok ? r.json() : {})
        .then(cfg => {
          if (cfg.recordatorio_mes_enviado !== mesActual) {
            setRecordatorioActivo(true);
          }
        })
        .catch(() => setRecordatorioActivo(true)); // si falla el fetch, mostrar de todas formas
    }
  }, [session?.user]);

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
  const [duplicadosAlerta, setDuplicadosAlerta] = useState([]);
  const [menuAbierto, setMenuAbierto] = useState(null);
  const [menuAbiertoDir, setMenuAbiertoDir] = useState('down');
  const [mostrarArchivados, setMostrarArchivados] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIdx, setCommandIdx] = useState(0);
  const [showGmailPanel, setShowGmailPanel] = useState(false);
  const [gmailEmails, setGmailEmails] = useState([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailUnread, setGmailUnread] = useState(0);
  const [gmailReply, setGmailReply] = useState(null);
  const [gmailReplyBody, setGmailReplyBody] = useState('');
  const [gmailSending, setGmailSending] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [tickerItems, setTickerItems] = useState([]);
  const [notasDashboard, setNotasDashboard] = useState([]);
  const [notaInput, setNotaInput] = useState('');
  const [notaLoading, setNotaLoading] = useState(false);
  const [showNotasDashboard, setShowNotasDashboard] = useState(false);
  const [gmailSelected, setGmailSelected] = useState(null);
  const [gmailSearch, setGmailSearch] = useState('');
  const [graficasVisibles, setGraficasVisibles] = useState(false);
  const [showNotaModal, setShowNotaModal] = useState(false);
  const [showDescargaMesModal, setShowDescargaMesModal] = useState(false);
  const [notaClienteId, setNotaClienteId] = useState(null);
  const [notaTexto, setNotaTexto] = useState('');
  const [editingCliente, setEditingCliente] = useState(null);
  const [formData, setFormData] = useState({ id: '', codigoCliente: '', nombre: '', contacto: '', estado: 'Cotizado', fechaCotizacion: '', fechaNotificacion: '', fechaPago: '', fechaFacturacion: '', fechaSuspension: '', mes: '', año: '', monto: '', comentario: '', historial: [] });
  const [pdfCargando, setPdfCargando] = useState(false);
  const [pdfError,    setPdfError]    = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [vistaCards, setVistaCards] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Detectar Electron y modo mini
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
      setIsElectron(true);
      document.body.classList.add('electron-mode');
      document.body.classList.add('is-electron');
      const handleResize = () => setIsMiniMode(window.innerWidth <= 380);
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Command Palette — Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(v => !v);
        setCommandQuery('');
        setCommandIdx(0);
      }
      if (e.key === 'Escape') setShowCommandPalette(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
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
  const [editingContactoId, setEditingContactoId] = useState(null);
  const [tempContacto, setTempContacto] = useState('');
  const [vistaReact, setVistaReact] = useState('no-generaron');
  const [editingCreditoMontoId, setEditingCreditoMontoId] = useState(null);
  const [tempCreditoMonto, setTempCreditoMonto] = useState('');
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [pagoClienteTarget, setPagoClienteTarget] = useState(null);
  const [showHistorialPagosModal, setShowHistorialPagosModal] = useState(false);
  const [historialPagosCliente, setHistorialPagosCliente] = useState(null);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoBanco, setPagoBanco] = useState('');
  const [pagoFecha, setPagoFecha] = useState('');
  const [pagoReferencia, setPagoReferencia] = useState('');
  const [pagoTipoNegocio, setPagoTipoNegocio] = useState('Servicio y Repuestos');
  const [showPagoCreditoModal, setShowPagoCreditoModal] = useState(false);
  const [pagoCreditoTarget, setPagoCreditoTarget] = useState(null);
  const [pagoCreditoMonto, setPagoCreditoMonto] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [showBusquedaGlobal, setShowBusquedaGlobal] = useState(false);
  const [horaActual, setHoraActual] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showWhatsappStatusModal, setShowWhatsappStatusModal] = useState(false);
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
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [usuariosAdmin, setUsuariosAdmin] = useState({});
  const [perfilData, setPerfilData] = useState(null);
  const [perfilNombre, setPerfilNombre] = useState('');
  const [perfilPassActual, setPerfilPassActual] = useState('');
  const [perfilPassNueva, setPerfilPassNueva] = useState('');
  const [perfilPassConfirm, setPerfilPassConfirm] = useState('');
  const [perfilShowPass, setPerfilShowPass] = useState(false);
  const [perfilSaving, setPerfilSaving] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [empresaActual, setEmpresaActual] = useState(null);
  const [empresaForm, setEmpresaForm] = useState({ nombre: '', slug: '' });
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
  const [activaciones, setActivaciones] = useState([]);
  const [nuevaActivNombre, setNuevaActivNombre] = useState('');
  const [loadingActivaciones, setLoadingActivaciones] = useState(false);

  // ── Documentos / Cotizaciones ────────────────────────────
  const [cotizaciones, setCotizaciones] = useState({});          // { clienteId: [{id, nombre, base64, fecha, monto}] }
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [docsClienteId, setDocsClienteId] = useState(null);
  const [nuevaCotForm, setNuevaCotForm] = useState({ monto: '', estado: 'Cotizado', show: false });
  const [showGenCotModal, setShowGenCotModal] = useState(false);
  const [genCotCliente, setGenCotCliente] = useState(null);
  const [cotItems, setCotItems] = useState([{ codigo: '', descripcion: '', cantidad: 1, precio: '', um: 'UND' }]);
  const [cotNota, setCotNota] = useState('');
  const [cotValidez, setCotValidez] = useState(30);
  const [cotConITBIS, setCotConITBIS] = useState(false);
  const [showNotifDocModal, setShowNotifDocModal] = useState(false);
  const [notifDocCliente, setNotifDocCliente] = useState(null);
  const [notifDocSeleccionado, setNotifDocSeleccionado] = useState(null);
  const [notifDocMensaje, setNotifDocMensaje] = useState('');
  const [showCargaMasivaModal, setShowCargaMasivaModal] = useState(false);
  const [archivosEnProceso, setArchivosEnProceso] = useState([]);
  const [cargaMasivaProcesando, setCargaMasivaProcesando] = useState(false);
  const [clientesConDoc, setClientesConDoc] = useState(new Set()); // IDs que ya tienen documento
  const [tabCargaMasiva, setTabCargaMasiva] = useState('subir'); // 'subir' | 'vincular'
  const [busquedaVincular, setBusquedaVincular] = useState('');
  const [vincularSelects, setVincularSelects] = useState({}); // { docId: nuevoClienteId }
  const [vincularLoading, setVincularLoading] = useState(null);
  const [showBuscadorDocsModal, setShowBuscadorDocsModal] = useState(false);
  const [busquedaDocsGlobal, setBusquedaDocsGlobal] = useState('');
  const [showGenMasivaModal, setShowGenMasivaModal] = useState(false);
  const [genMasivaActivo, setGenMasivaActivo] = useState(false);
  const [genMasivaProgreso, setGenMasivaProgreso] = useState({ total: 0, done: 0, ok: 0, error: 0 });
  const [genMasivaLog, setGenMasivaLog] = useState([]);

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
  const [waMasivoListoSiguiente, setWaMasivoListoSiguiente] = useState(false);
  const [waMasivoDestinosActual, setWaMasivoDestinosActual] = useState([]);
  const [waMasivoEsRecordatorio, setWaMasivoEsRecordatorio] = useState(false);
  const [waMasivoEnviados, setWaMasivoEnviados] = useState(0);
  const [recordatorioActivo, setRecordatorioActivo] = useState(false);

  // Cargar preferencias y datos desde API
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() : {})
      .then(cfg => {
        if (cfg.meta_mensual   != null) setMetaMensual(parseFloat(cfg.meta_mensual) || 0);
        if (cfg.color_acento)           setColorAcento(cfg.color_acento);
        if (cfg.recordatorio_dias)      setRecordatoriosDias(parseInt(cfg.recordatorio_dias) || 7);
        if (cfg.modo_compacto  != null) setModoCompacto(cfg.modo_compacto === 'true');
        // Guardar si ya fue enviado este mes para usarlo en el efecto separado
        const hoy = new Date();
        const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        if (cfg.recordatorio_mes_enviado === mesActual) {
          setRecordatorioActivo(false);
        }
      })
      .catch(() => {});
    fetch('/api/plantillas')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data) && data.length > 0) setPlantillas(data); })
      .catch(() => {});
    fetch('/api/historial-conciliaciones')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setHistorialConciliaciones(data); })
      .catch(() => {});
    fetch('/api/permisos-rol')
      .then(r => r.ok ? r.json() : {})
      .then(data => setPermisosRol(data))
      .catch(() => {});
  }, []);


  // Aplicar color de acento como variable CSS
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', colorAcento);
    const hex = colorAcento.replace('#','');
    const r = parseInt(hex.substring(0,2),16), g = parseInt(hex.substring(2,4),16), b = parseInt(hex.substring(4,6),16);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.15)`);
    if (hydrated) fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave:'color_acento', valor: colorAcento }) }).catch(()=>{});
  }, [colorAcento]);

  useEffect(() => { if (hydrated) fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave:'meta_mensual', valor: String(metaMensual) }) }).catch(()=>{}); }, [metaMensual]);
  useEffect(() => { if (hydrated) fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave:'recordatorio_dias', valor: String(recordatoriosDias) }) }).catch(()=>{}); }, [recordatoriosDias]);
  useEffect(() => { if (hydrated) fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave:'modo_compacto', valor: String(modoCompacto) }) }).catch(()=>{}); }, [modoCompacto]);

  const obtenerMesActual = () => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  };

  // ── Cierre automático de mes ──────────────────────────────
  const cierreAutomaticoMes = async (clientesActuales, creditosActuales) => {
    try {
      const mesActual = obtenerMesActual();
      // Verificar si ya existe snapshot de este mes
      const res = await fetch('/api/historial-meses');
      const historial = await res.json();
      const mesesGuardados = historial.map(h => h.mes_key);
      // Buscar el último mes guardado
      const ultimoMes = mesesGuardados.sort().reverse()[0];
      // Si el último mes guardado es diferente al actual, hacer cierre
      if (ultimoMes && ultimoMes !== mesActual && !mesesGuardados.includes(mesActual)) {
        // Guardar snapshot del mes anterior
        const snapshotDatos = {
          clientes: JSON.parse(JSON.stringify(clientesActuales)),
          creditos: JSON.parse(JSON.stringify(creditosActuales)),
          fechaGuardado: new Date().toISOString()
        };
        await fetch('/api/historial-meses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mes_key: ultimoMes, datos: snapshotDatos })
        });
        // Reiniciar montos y estados de todos los clientes
        await fetch('/api/clientes/reiniciar-mes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': document.cookie.match(/csrf-token=([^;]+)/)?.[1] || '' },
          body: JSON.stringify({ empresa_id: session?.user?.empresa_id })
        });
        return true;
      }
      return false;
    } catch(e) {
      console.error('Error en cierre automático:', e);
      return false;
    }
  };

  const [mesVisualizando, setMesVisualizando] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  });


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

  // ── Cargar empresa actual del usuario ──────────────────────
  useEffect(() => {
    const empresaId = session?.user?.empresa_id;
    if (!empresaId) return;
    fetch('/api/empresas')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const emp = data.find(e => e.id === empresaId);
          if (emp) setEmpresaActual(emp);
        }
      })
      .catch(() => {});
  }, [session]);

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
    if (cliente.estado === 'Archivado') return 'Archivado';
    const docs = cotizaciones[cliente.id] || [];
    if (!docs.length) {
      // Sin documentos: 'Cotizado' solo es válido si el usuario marcó el proceso manualmente
      // (fechaCotizacion presente). Si solo es el valor default, mostrar 'No Generaron'
      if (cliente.estado === 'Cotizado' && !cliente.fechaCotizacion) return 'No Generaron';
      return cliente.estado;
    }
    return docs.reduce((a, b) => (a.id > b.id ? a : b)).estado || cliente.estado || 'Cotizado';
  };

  const mesesSinActividad = (cliente) => {
    const historial = cliente.historial || [];
    // Buscar última acción positiva
    const acciones = ['Marco Pagado', 'Marco Facturado', 'Marco Notificado', 'Notificado'];
    const entradas = historial
      .filter(h => h.fecha && acciones.some(a => (h.accion || '').includes(a)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (entradas.length === 0) {
      // Usar mes/año del cliente
      if (cliente.mes && cliente.anio) {
        const hoy = new Date();
        const diff = (hoy.getFullYear() - parseInt(cliente.anio)) * 12 + (hoy.getMonth() + 1 - parseInt(cliente.mes));
        return diff > 0 ? diff : 0;
      }
      return null;
    }
    const ultima = new Date(entradas[0].fecha);
    const hoy = new Date();
    const diff = (hoy.getFullYear() - ultima.getFullYear()) * 12 + (hoy.getMonth() - ultima.getMonth());
    return Math.max(0, diff);
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

    // Combinar estado directo del cliente con cotizaciones cargadas
    const obtenerEstadoFinal = (c) => {
      // Estados terminales del cliente tienen prioridad sobre el estado del documento
      if (c.estado === 'Pagado' || c.estado === 'Facturado' || c.estado === 'Vencido') return c.estado;
      const docs = cotizaciones[c.id] || [];
      if (docs.length === 0) {
        // Sin documentos: 'Cotizado' solo es válido si se marcó el proceso manualmente
        if (c.estado === 'Cotizado' && !c.fechaCotizacion) return 'No Generaron';
        return c.estado;
      }
      return docs.reduce((a, b) => (a.id > b.id ? a : b)).estado || c.estado;
    };
    const obtenerMontoFinal = (c) => {
      const docs = cotizaciones[c.id] || [];
      const montoCots = docs.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
      return montoCots > 0 ? montoCots : (parseFloat(c.monto) || 0);
    };

    const clientesEnriquecidos = clientesData.map(c => ({ ...c, _estado: obtenerEstadoFinal(c), _monto: obtenerMontoFinal(c) }));
    const sumMonto = (arr) => arr.reduce((s, c) => s + (c._monto || 0), 0);
    const cotizados   = clientesEnriquecidos.filter(c => c._estado === 'Cotizado');
    const notificados = clientesEnriquecidos.filter(c => c._estado === 'Notificado');
    const pagados     = clientesEnriquecidos.filter(c => c._estado === 'Pagado');
    const facturados  = clientesEnriquecidos.filter(c => c._estado === 'Facturado');
    const vencidos    = clientesEnriquecidos.filter(c => c._estado === 'Vencido');
    const suspendidos = clientesData.filter(c => c.suspendido === true);
    const noGeneraron = clientesEnriquecidos.filter(c => c._estado === 'No Generaron');
    const sinDocumento = clientesEnriquecidos.filter(c => c._estado === 'Cotizado' && (cotizaciones[c.id] || []).length === 0);
    return {
      cotizado: cotizados.length, notificado: notificados.length,
      pagado: pagados.length, facturado: facturados.length,
      vencido: vencidos.length, suspendido: suspendidos.length,
      noGeneraron: noGeneraron.length, sinDocumento: sinDocumento.length, total,
      montoCotizado: sumMonto(cotizados), montoNotificado: sumMonto(notificados),
      montoPagado: sumMonto(pagados), montoFacturado: sumMonto(facturados),
      montoVencido: sumMonto(vencidos),
      montoSuspendido: suspendidos.reduce((acc, c) => {
        const m = parseFloat(c.monto) || 0;
        const p = (c.pagosRealizados || []).reduce((s, x) => s + (parseFloat(x.monto) || 0), 0);
        return acc + Math.max(0, m - p);
      }, 0),
      cotizadoPct:    total > 0 ? ((cotizados.length   / total) * 100).toFixed(0) : 0,
      notificadoPct:  total > 0 ? ((notificados.length / total) * 100).toFixed(0) : 0,
      pagadoPct:      total > 0 ? ((pagados.length     / total) * 100).toFixed(0) : 0,
      facturadoPct:   total > 0 ? ((facturados.length  / total) * 100).toFixed(1) : 0,
      vencidoPct:     total > 0 ? ((vencidos.length    / total) * 100).toFixed(1) : 0,
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
        new Notification('PayTrack - Créditos Vencidos', { body: `Tienes ${creditosVencidos.length} crédito(s) vencido(s) que requieren atención.`, icon: '/favicon.ico' });
      }
      if (creditosAlerta.length > 0) {
        new Notification('PayTrack - Créditos por Vencer', { body: `${creditosAlerta.length} crédito(s) vencen en los próximos 7 días.`, icon: '/favicon.ico' });
      }
    };
    if (Notification.permission === 'granted') { enviarNotif(); }
    else if (Notification.permission !== 'denied') { Notification.requestPermission().then(p => { if (p === 'granted') enviarNotif(); }); }
  }, []);

  const clientesFiltrados = useMemo(() => {
    let resultado = datosActuales.clientes;
    // Excluir archivados del listado principal salvo que se active el toggle
    if (!mostrarArchivados) resultado = resultado.filter(c => c.estado !== 'Archivado');
    const myUsername = (session?.user?.username || '').toLowerCase();
    if (filter === 'delegaciones') {
      // Solo clientes delegados (creados por otro usuario)
      resultado = resultado.filter(c => c.creadoPor.toLowerCase() !== myUsername);
    } else if (!puedeVerTodo) {
      // Cartera propia: solo los del usuario actual
      resultado = resultado.filter(c => c.creadoPor.toLowerCase() === myUsername);
    }
    if (filtroAgente) resultado = resultado.filter(c => c.creadoPor === filtroAgente);
    if (searchTerm) resultado = resultado.filter(c => c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || (c.contacto || '').includes(searchTerm) || c.id.toString().includes(searchTerm) || (c.codigoCliente || '').toLowerCase().includes(searchTerm.toLowerCase()));
    if (fechaDesde) resultado = resultado.filter(c => c.fechaCotizacion && c.fechaCotizacion >= fechaDesde);
    if (fechaHasta) resultado = resultado.filter(c => c.fechaCotizacion && c.fechaCotizacion <= fechaHasta);
    if (filtroMontoMin !== '') resultado = resultado.filter(c => (parseFloat(c.monto) || 0) >= parseFloat(filtroMontoMin));
    if (filtroMontoMax !== '') resultado = resultado.filter(c => (parseFloat(c.monto) || 0) <= parseFloat(filtroMontoMax));
    if (filtroEstados.length > 0) resultado = resultado.filter(c => filtroEstados.includes(estadoActivoCliente(c)));
    else if (filter !== 'todos' && filter !== 'delegaciones') {
      if (filter === 'no-generaron') resultado = resultado.filter(c => c.estado === 'No Generaron');
      else if (filter === 'sin-documento') resultado = resultado.filter(c => estadoActivoCliente(c) === 'Cotizado' && (cotizaciones[c.id] || []).length === 0);
      else if (filter === 'suspendido') resultado = datosActuales.clientes.filter(c => c.suspendido === true);
      else resultado = resultado.filter(c => estadoActivoCliente(c).toLowerCase() === filter);
    }
    resultado = [...resultado].sort((a, b) => {
      let comparacion = 0;
      if (ordenarPor === 'prioridad') {
        const p = { 'Vencido': 1, 'Notificado': 2, 'Cotizado': 3, 'Pagado': 4, 'Facturado': 5, 'No Generaron': 6 };
        comparacion = (p[estadoActivoCliente(a)] || 999) - (p[estadoActivoCliente(b)] || 999);
      } else if (ordenarPor === 'id') comparacion = parseInt(a.id) - parseInt(b.id);
      else if (ordenarPor === 'codigo') comparacion = parseInt(a.codigoCliente || 0) - parseInt(b.codigoCliente || 0);
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

  const cerrarModal = () => { setShowModal(false); setEditingCliente(null); setPdfError(''); setDuplicadosAlerta([]); };

  const detectarDuplicados = (nombre, contacto) => {
    if (editingCliente) return; // al editar no es necesario
    const norm = (s) => (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '').trim();
    const normTel = (t) => (t || '').replace(/\D/g, '');
    const nNombre = norm(nombre);
    const nTel = normTel(contacto);
    if (!nNombre && !nTel) { setDuplicadosAlerta([]); return; }
    const encontrados = clientes.filter(c => {
      if (nTel.length >= 7 && normTel(c.contacto) === nTel) return true;
      if (nNombre.length >= 3) {
        const cN = norm(c.nombre);
        if (cN === nNombre) return true;
        if (cN.length > 3 && (cN.includes(nNombre) || nNombre.includes(cN))) return true;
        const words = nNombre.split(/\s+/).filter(w => w.length > 2);
        if (words.length > 0) {
          const cWords = cN.split(/\s+/);
          const hits = words.filter(w => cWords.some(cw => cw === w || cw.includes(w)));
          if (hits.length / words.length >= 0.6) return true;
        }
      }
      return false;
    });
    setDuplicadosAlerta(encontrados.slice(0, 3));
  };

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
        showToast(accion === 'aceptar' ? 'Delegación aceptada. Los clientes ya están en tu cartera.' : 'Delegación rechazada.', accion === 'aceptar' ? 'success' : 'info');
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
  const guardarContactoInline = (clienteId) => {
    const updated = clientes.find(c => c.id === clienteId);
    if (updated) actualizarCliente({ ...updated, contacto: tempContacto, historial: [...(updated.historial || []), { fecha: new Date().toISOString(), accion: `Teléfono actualizado a ${tempContacto}`, usuario: currentUser || 'SISTEMA' }] });
    setEditingContactoId(null); setTempContacto('');
  };
  const cancelarEdicionContacto = () => { setEditingContactoId(null); setTempContacto(''); };

  const esMorosoRecurrente = (cliente) => {
    const historial = cliente.historial || [];
    const meses = new Set();
    historial.forEach(h => { if (h.accion?.includes('Notificado') && h.fecha) meses.add(h.fecha.substring(0, 7)); });
    return meses.size >= 2;
  };

  const esClienteNuevo = (cliente) => {
    if (!cliente.created_at) return false;
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    return cliente.created_at.startsWith(mesActual);
  };

  const formatTelefono = (tel) => {
    if (!tel || tel === '—') return '—';
    const limpio = tel.replace(/[\s\(\)\-\.]/g, '');
    if (limpio.startsWith('+1')) return '+1' + limpio.slice(2);
    if (limpio.startsWith('+')) return limpio.slice(0, 12);
    return limpio.slice(0, 10);
  };

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

  // Gmail desactivado — descomentar para reactivar
  // useEffect(() => {
  //   const params = new URLSearchParams(window.location.search);
  //   if (params.get('gmail_ok')) { cargarGmail(); window.history.replaceState({}, '', window.location.pathname); }
  // }, []);
  // useEffect(() => {
  //   const interval = setInterval(() => { cargarGmail(); }, 10 * 60 * 1000);
  //   return () => clearInterval(interval);
  // }, []);

  const cargarGmail = async (q = '') => {
    setGmailLoading(true);
    try {
      const res = await fetch(`/api/gmail${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const data = res.ok ? await res.json() : { emails: [], linked: false };
      if (data.linked === false) { setGmailEmails([]); setGmailUnread(0); setGmailLoading(false); return; }
      setGmailEmails(data.emails || []);
      setGmailUnread((data.emails || []).filter(e => e.unread).length);
    } catch(e) {}
    setGmailLoading(false);
  };

  const marcarGmailLeido = async (id) => {
    await fetch('/api/gmail', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    setGmailEmails(prev => prev.map(e => e.id === id ? {...e, unread: false} : e));
    setGmailUnread(prev => Math.max(0, prev - 1));
  };

  const abrirPagoModal = (cliente) => { setPagoClienteTarget(cliente); setPagoMonto(''); setShowPagoModal(true); };
  const cargarPagosPendientes = async () => {
    try {
      const res = await fetch('/api/pagos?estado=pendiente');
      const data = await res.json();
      if (Array.isArray(data)) {
        setPagosPendientes(data);
        setPagosPendientesCount(data.length);
      }
    } catch (e) { showToast('Error cargando pagos pendientes', 'error'); }
  };

  const validarPago = async (id, accion, motivo) => {
    try {
      const res = await fetch('/api/pagos', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estado: accion === 'aprobar' ? 'aprobado' : 'rechazado', motivo_rechazo: motivo || '', validado_por: currentUser || 'SISTEMA' }) });
      if (res.ok) {
        showToast(accion === 'aprobar' ? 'Pago aprobado' : 'Pago rechazado', accion === 'aprobar' ? 'success' : 'error');
        setPagoRechazandoId(null);
        setMotivoRechazo('');
        cargarPagosPendientes();
        cargarClientes();
      }
    } catch (e) { showToast('Error al validar pago', 'error'); }
  };

  const confirmarPago = () => {
    if (!pagoClienteTarget) return;
    const montoPagado = parseFloat(pagoMonto);
    if (!montoPagado || montoPagado <= 0) { showToast('Monto inválido', 'error'); return; }
    const saldo = calcularSaldoCliente(pagoClienteTarget);
    if (montoPagado > saldo.pendiente + 0.001) { alert('El monto supera el saldo pendiente'); return; }
    const nuevoPago = { id: Date.now(), monto: montoPagado, fecha: new Date().toISOString(), fechaFormato: new Date().toLocaleDateString('es-DO'), banco: pagoBanco, tipoNegocio: pagoTipoNegocio, referencia: pagoReferencia, fechaPago: pagoFecha || new Date().toISOString().split('T')[0] };
    const pagosActualizados = [...(pagoClienteTarget.pagosRealizados || []), nuevoPago];
    const totalPagado = pagosActualizados.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
    const montoTotal = parseFloat(pagoClienteTarget.monto) || 0;
    const pagadoCompleto = totalPagado >= montoTotal - 0.001;
    const clienteActualizado = { ...pagoClienteTarget, pagosRealizados: pagosActualizados, estado: pagadoCompleto ? 'Pagado' : pagoClienteTarget.estado, fechaPago: pagadoCompleto ? new Date().toISOString().split('T')[0] : pagoClienteTarget.fechaPago, historial: [...(pagoClienteTarget.historial || []), { fecha: new Date().toISOString(), accion: `Pago registrado: ${montoPagado.toLocaleString()} / Total: ${totalPagado.toLocaleString()} de ${montoTotal.toLocaleString()}`, usuario: currentUser || 'SISTEMA' }] };
    setClientes(prev => prev.map(c => c.id === pagoClienteTarget.id ? clienteActualizado : c));
    if (pagadoCompleto) sincronizarEstadoCotizacion(pagoClienteTarget.id, 'Pagado');
    setShowPagoModal(false); setPagoClienteTarget(null); setPagoMonto(''); setPagoBanco(''); setPagoFecha(''); setPagoReferencia(''); setPagoTipoNegocio('Servicio y Repuestos');
    fetch('/api/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      cliente_id: pagoClienteTarget.id,
      cliente_nombre: pagoClienteTarget.nombre,
      monto: montoPagado,
      fecha: new Date().toISOString(),
      fecha_formato: new Date().toLocaleDateString('es-DO'),
      fecha_pago: pagoFecha || new Date().toISOString().split('T')[0],
      banco: pagoBanco,
      referencia: pagoReferencia,
      tipo_negocio: pagoTipoNegocio,
      nota: pagoReferencia,
      estado: 'pendiente',
      creado_por: currentUser || 'SISTEMA',
    }) }).catch(() => null);
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
        showToast(`${importados} de ${nuevos.length} clientes importados`, 'success');
      } catch { showToast('Error al leer el archivo Excel', 'error'); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const abrirWhatsappModal = (cliente) => {
    setWhatsappCliente(cliente);
    setWhatsappMensaje(getMsgFactura(cliente));
    setShowWhatsappModal(true);
    // Cargar documento si aún no está en estado
    if (!cotizaciones[cliente.id]) {
      fetch(`/api/cotizaciones/${cliente.id}`)
        .then(r => r.ok ? r.json() : [])
        .then(docs => setCotizaciones(prev => ({ ...prev, [cliente.id]: docs })))
        .catch(() => {});
    }
  };

  const marcarNotificado = (cliente) => {
    if (cliente.fechaNotificacion) return;
    const a = { ...cliente, fechaNotificacion: new Date().toISOString().split('T')[0], estado: 'Notificado' };
    a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: 'Notificado vía WhatsApp', usuario: currentUser || session?.user?.username || 'Sistema' }];
    actualizarCliente(a);
    sincronizarEstadoCotizacion(cliente.id, 'Notificado');
  };

  const enviarWhatsapp = async () => {
    if (!whatsappCliente) return;
    const num = whatsappCliente.contacto.replace(/\D/g, '');
    const docs = cotizaciones[whatsappCliente.id] || [];
    let doc = docs[docs.length - 1] || null;

    // Si el doc existe pero no tiene base64, cargarlo completo
    if (doc && !doc.base64) {
      try {
        const res = await fetch(`/api/cotizaciones/${whatsappCliente.id}`);
        const fullDocs = await res.json();
        setCotizaciones(prev => ({ ...prev, [whatsappCliente.id]: fullDocs }));
        doc = fullDocs[fullDocs.length - 1] || null;
      } catch { doc = null; }
    }

    setShowWhatsappModal(false);
    if (window.electronAPI?.isElectron) {
      const waStatus = await window.electronAPI.whatsappStatus().catch(() => ({ conectado: false }));
      if (waStatus.conectado && doc?.base64) {
        showToast("Enviando por WhatsApp...", "info");
        const result = await window.electronAPI.whatsappEnviarPDF(num, doc.base64, doc.nombre, whatsappMensaje);
        if (result.ok) {
          showToast("✅ Enviado por WhatsApp automáticamente", "success");
        } else {
          showToast("Error: " + result.error, "error");
        }
      } else if (doc?.base64) {
        const result = await window.electronAPI.sendPDFWhatsApp(doc.base64, doc.nombre, num, whatsappMensaje);
        if (!result.ok) {
          if (doc) descargarDocumento(doc);
          window.open(`https://wa.me/1${num}?text=${encodeURIComponent(whatsappMensaje)}`, "_blank");
        } else {
          showToast("PDF copiado al portapapeles — Ctrl+V en WhatsApp para pegarlo", "success");
        }
      }
    } else {
      if (doc?.base64) descargarDocumento(doc);
      window.open(`https://wa.me/1${num}?text=${encodeURIComponent(whatsappMensaje)}`, "_blank");
    }


    // Marcar como Notificado automáticamente
    marcarNotificado(whatsappCliente);
  };

  const generarReciboPDF = (cliente, pago) => {
    import('jspdf').then(({ default: jsPDF }) => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.setFillColor(30, 45, 74); doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont(undefined, 'bold');
      doc.text('PayTrack', 15, 18);
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
      doc.text('Este recibo fue generado automáticamente por PayTrack.', 15, 270);
      doc.save(`recibo-${cliente.nombre.replace(/ /g,'-')}-${new Date().toISOString().split('T')[0]}.pdf`);
    });
  };

  const exportarPDF = () => {
    if (!clientes.length) { showToast('No hay clientes', 'info'); return; }
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then((autotableModule) => { const autoTable = autotableModule.default || autotableModule;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('PayTrack - Reporte de Cartera', 14, 15);
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
      import('jspdf-autotable').then((autotableModule) => { const autoTable = autotableModule.default || autotableModule;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('PayTrack - Reporte de Créditos', 14, 15);
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

  const ejecutarCierreMes = async () => {
    const mesActual = obtenerMesActual();
    const mesNombre = obtenerNombreMes(mesActual);
    setShowDescargaMesModal(false);
    showToast('Ejecutando cierre de mes…', 'info');
    try {
      // 1. Guardar snapshot del mes actual en historial
      const snapshotDatos = { clientes: JSON.parse(JSON.stringify(clientes)), creditos: JSON.parse(JSON.stringify(creditos)), fechaGuardado: new Date().toISOString() };
      setHistorialMeses({ ...historialMeses, [mesActual]: snapshotDatos });
      await fetch('/api/historial-meses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes_key: mesActual, datos: snapshotDatos }) });
      // 2. Descargar Excel del mes
      const datosCartera = clientes.map(c => ({ 'ID': c.id, 'Cliente': c.nombre, 'Contacto': c.contacto || '', 'Estado': c.estado, 'Monto': parseFloat(c.monto || 0), 'Mes': c.mes + '/' + c.año, 'Fecha Cotización': c.fechaCotizacion || '', 'Fecha Notificación': c.fechaNotificacion || '', 'Fecha Pago': c.fechaPago || '', 'Fecha Facturación': c.fechaFacturacion || '', 'Suspendido': c.suspendido ? 'Sí' : 'No', 'Comentario': c.comentario || '' }));
      const datosCreditos2 = creditos.map(c => ({ 'ID': c.id, 'Nº Orden': c.numeroOrden, 'Cliente': c.cliente, 'Monto': parseFloat(c.monto || 0), 'Fecha Inicio': c.fechaInicio, 'Plazo (meses)': c.plazoMeses, 'Fecha Vencimiento': c.fechaVencimiento, 'Estado': c.estado, 'Comentario': c.comentario || '' }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datosCartera), 'Cartera');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datosCreditos2), 'Créditos');
      XLSX.writeFile(wb, `Reporte_${mesNombre.replace(/ /g, '_')}.xlsx`);
      // 3. Reiniciar clientes y limpiar documentos del mes anterior
      const res = await fetch('/api/clientes/reiniciar-mes', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) { showToast('Error al reiniciar clientes', 'error'); return; }
      // 4. Recargar datos
      await cargarClientes();
      setCotizaciones({});
      showToast(`Cierre de ${mesNombre} completado · Clientes reiniciados · Documentos del mes anterior eliminados`, 'success');
    } catch { showToast('Error durante el cierre de mes', 'error'); }
  };

  // ─── DOCUMENTOS / COTIZACIONES ───────────────────────────
  const cargarTodosDocumentos = async () => {
    try {
      const res = await fetch('/api/cotizaciones');
      if (!res.ok) return;
      const grouped = await res.json();
      setCotizaciones(prev => {
        const next = { ...prev };
        Object.entries(grouped).forEach(([cid, docs]) => {
          // Solo sobreescribir si no tenemos base64 aún para ese cliente
          const existing = prev[cid];
          if (!existing || existing.every(d => !d.base64)) next[cid] = docs;
        });
        return next;
      });
    } catch {}
  };

  const abrirDocsModal = (cliente) => {
    setDocsClienteId(cliente.id);
    setShowDocsModal(true);
    // Siempre recargar con base64 completo al abrir el modal individual
    fetch(`/api/cotizaciones/${cliente.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(docs => setCotizaciones(prev => ({ ...prev, [cliente.id]: docs })))
      .catch(() => {});
  };

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
      fetch(`/api/cotizaciones/${clienteId}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nombre: file.name, base64, monto: montoDetectado, fecha: nueva.fecha, estado: 'Cotizado', tipo: 'subido' }) })
        .then(r => r.ok ? r.json() : null)
        .then(saved => { if (saved) setCotizaciones(prev => ({ ...prev, [clienteId]: (prev[clienteId]||[]).map(d => d.id === nueva.id ? { ...d, id: saved.id } : d) })); })
        .catch(() => {});
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
    setCotizaciones(prev => {
      const restantes = (prev[clienteId] || []).filter(d => d.id !== docId);
      // Si ya no quedan documentos y el proceso no fue marcado manualmente,
      // revertir el estado 'Cotizado' a 'No Generaron'
      if (restantes.length === 0) {
        const clienteActual = clientes.find(c => c.id === clienteId);
        if (clienteActual && clienteActual.estado === 'Cotizado' && !clienteActual.fechaCotizacion) {
          actualizarCliente({ ...clienteActual, estado: 'No Generaron' });
        }
      }
      return { ...prev, [clienteId]: restantes };
    });
    fetch(`/api/cotizaciones/${clienteId}/${docId}`, { method:'DELETE' }).catch(() => {});
    showToast('Documento eliminado', 'info');
  };

  const actualizarEstadoCotizacion = (clienteId, docId, nuevoEstado) => {
    setCotizaciones(prev => ({
      ...prev,
      [clienteId]: (prev[clienteId] || []).map(d => d.id === docId ? { ...d, estado: nuevoEstado } : d)
    }));
    fetch(`/api/cotizaciones/${clienteId}/${docId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ estado: nuevoEstado }) }).catch(() => {});
  };

  const crearCotizacionManual = async (clienteId, monto, estado = 'Cotizado') => {
    const nueva = { id: Date.now(), nombre: null, base64: null, fecha: new Date().toISOString(), monto: parseFloat(monto), tipo: 'manual', estado };
    setCotizaciones(prev => ({ ...prev, [clienteId]: [...(prev[clienteId] || []), nueva] }));
    showToast(`Cotización creada · RD$${parseFloat(monto).toLocaleString('en-US')} · ${estado}`, 'success');
    try {
      const res = await fetch(`/api/cotizaciones/${clienteId}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nombre: null, base64: null, monto: parseFloat(monto), fecha: nueva.fecha, estado, tipo: 'manual' }) });
      if (res.ok) { const saved = await res.json(); setCotizaciones(prev => ({ ...prev, [clienteId]: (prev[clienteId]||[]).map(d => d.id === nueva.id ? { ...d, id: saved.id } : d) })); }
    } catch { /* fire and forget */ }
  };

  // Sincroniza el estado de la cotización más reciente con el estado del cliente
  const sincronizarEstadoCotizacion = (clienteId, nuevoEstado) => {
    if (!['Cotizado','Notificado','Pagado','Facturado','Vencido'].includes(nuevoEstado)) return;
    setCotizaciones(prev => {
      const docs = prev[clienteId] || [];
      if (!docs.length) return prev;
      const ultima = docs.reduce((a, b) => (a.id > b.id ? a : b));
      fetch(`/api/cotizaciones/${clienteId}/${ultima.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ estado: nuevoEstado }) }).catch(() => {});
      return { ...prev, [clienteId]: docs.map(d => d.id === ultima.id ? { ...d, estado: nuevoEstado } : d) };
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
    setNotifDocMensaje(getMsgFactura(cliente));
    setShowNotifDocModal(true);
  };

  const enviarNotifConDocumento = async () => {
    if (!notifDocCliente || !notifDocSeleccionado) return;
    const num = (notifDocCliente.contacto || '').replace(/\D/g, '');

    if (window.electronAPI?.isElectron) {
      // Modo escritorio: asegurar que tenemos el base64 completo
      let doc = notifDocSeleccionado;
      if (!doc.base64) {
        try {
          const res = await fetch(`/api/cotizaciones/${notifDocCliente.id}`);
          const docs = await res.json();
          doc = docs.find(d => d.id === doc.id) || doc;
        } catch {}
      }
      setShowNotifDocModal(false);
      if (doc.base64) {
        const result = await window.electronAPI.sendPDFWhatsApp(doc.base64, doc.nombre, num, notifDocMensaje);
        if (result.ok) {
          showToast('PDF copiado al portapapeles — Ctrl+V en WhatsApp para pegarlo', 'success');
        } else {
          // Fallback si falla PowerShell
          descargarDocumento(doc);
          window.open(`https://wa.me/1${num}?text=${encodeURIComponent(notifDocMensaje)}`, '_blank');
          showToast('WhatsApp abierto. Adjunta el PDF descargado al mensaje.', 'info');
        }
      } else {
        showToast('No se pudo cargar el documento', 'error');
      }
    } else {
      // Modo web: flujo original
      descargarDocumento(notifDocSeleccionado);
      setTimeout(() => {
        window.open(`https://wa.me/1${num}?text=${encodeURIComponent(notifDocMensaje)}`, '_blank');
        setShowNotifDocModal(false);
        showToast('WhatsApp abierto. Adjunta el PDF descargado al mensaje.', 'success');
      }, 800);
    }
  };

  const abrirGenCotModal = (cliente) => {
    setGenCotCliente(cliente);
    const plantilla = COT_PLANTILLAS[cliente.id];
    if (plantilla && plantilla.length > 0) {
      setCotItems(plantilla.map(it => ({ ...it })));
    } else {
      setCotItems([{ descripcion: `Servicio — ${cliente.nombre}`, cantidad: 1, precio: parseFloat(cliente.monto) || '', um: 'UND' }]);
    }
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
      import('jspdf-autotable').then((autotableModule) => {
        const autoTable = autotableModule.default || autotableModule;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const fecha = new Date();
        const emp = empresaActual || {};
        const numCot = String((emp.numero_cotizacion || 1)).padStart(6, '0');

        // ── LOGO (si existe) ──
        const pageW = 210;
        const margin = 15;

        if (emp.logo_url) {
          try { doc.addImage(emp.logo_url, 'PNG', margin, 10, 35, 20); } catch(e) {}
        }

        // ── NOMBRE Y DATOS EMPRESA (arriba izquierda) ──
        doc.setFont(undefined, 'bold');
        doc.setFontSize(13);
        doc.setTextColor(30, 30, 30);
        doc.text(emp.nombre || 'Mi Empresa', margin + (emp.logo_url ? 38 : 0), 16);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        let dyEmp = 22;
        if (emp.direccion) { doc.text(emp.direccion, margin + (emp.logo_url ? 38 : 0), dyEmp); dyEmp += 5; }
        if (emp.ciudad)    { doc.text(emp.ciudad, margin + (emp.logo_url ? 38 : 0), dyEmp); dyEmp += 5; }
        if (emp.telefono)  { doc.text(`Tel. ${emp.telefono}`, margin + (emp.logo_url ? 38 : 0), dyEmp); dyEmp += 5; }
        if (emp.rnc)       { doc.text(`RNC: ${emp.rnc}`, margin + (emp.logo_url ? 38 : 0), dyEmp); }

        // ── TÍTULO COTIZACIÓN (arriba derecha) ──
        doc.setFont(undefined, 'bold');
        doc.setFontSize(22);
        doc.setTextColor(30, 30, 30);
        doc.text('COTIZACION', pageW - margin, 18, { align: 'right' });

        // ── TABLA FECHA / NUMERO ──
        autoTable(doc, {
          startY: 32,
          head: [['FECHA', 'NUMERO']],
          body: [[fecha.toLocaleDateString('es-DO'), numCot]],
          styles: { fontSize: 9, cellPadding: 2, halign: 'center' },
          headStyles: { fillColor: [255,255,255], textColor: [30,30,30], fontStyle: 'bold', lineWidth: 0.3, lineColor: [180,180,180] },
          bodyStyles: { lineWidth: 0.3, lineColor: [180,180,180] },
          tableWidth: 70,
          margin: { left: pageW - margin - 70 },
        });

        // ── TABLA CLIENTE ──
        const yCliente = 46;
        autoTable(doc, {
          startY: yCliente,
          head: [['CLIENTE:', 'CONTACTO', 'TIEMPO DE ENTREGA']],
          body: [[genCotCliente.nombre, genCotCliente.contacto || '', `Válida ${cotValidez} días`]],
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [255,255,255], textColor: [30,30,30], fontStyle: 'bold', lineWidth: 0.3, lineColor: [180,180,180] },
          bodyStyles: { lineWidth: 0.3, lineColor: [180,180,180] },
          margin: { left: margin, right: margin },
        });

        // ── TABLA VENDEDOR / CONDICIONES ──
        const yVendedor = doc.lastAutoTable.finalY;
        autoTable(doc, {
          startY: yVendedor,
          head: [['VENDEDOR', 'CONDICIONES', 'DESCTO %']],
          body: [[emp.vendedor || session?.user?.nombre || 'Vendedor', 'CONTADO', '0.00']],
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [255,255,255], textColor: [30,30,30], fontStyle: 'bold', lineWidth: 0.3, lineColor: [180,180,180] },
          bodyStyles: { lineWidth: 0.3, lineColor: [180,180,180] },
          margin: { left: margin, right: margin },
        });

        // ── TABLA DE ITEMS ──
        const subtotal = cotItems.reduce((s, it) => s + (parseFloat(it.precio)||0) * (parseFloat(it.cantidad)||1), 0);
        const descuento = 0;
        const subTotal2 = subtotal - descuento;
        const itax = subTotal2 * (cotConITBIS ? 0.18 : 0);
        const total = subTotal2 + itax;

        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 2,
          head: [['CODIGO', 'DESCRIPCION', 'CANTIDAD', 'U/M', 'PRECIO', 'TOTAL']],
          body: [
            ...cotItems.map((it) => {
              const p = parseFloat(it.precio) || 0;
              const q = parseFloat(it.cantidad) || 1;
              return [it.codigo || '—', it.descripcion, q.toFixed(2), it.um || 'UND', p.toLocaleString('en-US',{minimumFractionDigits:2}), (p*q).toLocaleString('en-US',{minimumFractionDigits:2})];
            }),
            ...Array(Math.max(0, 10 - cotItems.length)).fill(['', '', '', '', '', '']),
          ],
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [255,255,255], textColor: [30,30,30], fontStyle: 'bold', lineWidth: 0.3, lineColor: [180,180,180] },
          bodyStyles: { lineWidth: 0.3, lineColor: [180,180,180] },
          columnStyles: {
            0: { cellWidth: 22 },
            2: { halign: 'right' },
            3: { halign: 'center', cellWidth: 15 },
            4: { halign: 'right' },
            5: { halign: 'right', fontStyle: 'bold' },
          },
          margin: { left: margin, right: margin },
        });

        // ── TOTALES ──
        const yTotales = doc.lastAutoTable.finalY;
        autoTable(doc, {
          startY: yTotales,
          body: [
            ['TOTAL BRUTO', subtotal.toLocaleString('en-US',{minimumFractionDigits:2})],
            ['DESCUENTO', descuento.toLocaleString('en-US',{minimumFractionDigits:2})],
            ['SUB TOTAL', subTotal2.toLocaleString('en-US',{minimumFractionDigits:2})],
            [`ITBIS (18%)`, itax.toLocaleString('en-US',{minimumFractionDigits:2})],
          ],
          styles: { fontSize: 9, cellPadding: 2, lineWidth: 0.3, lineColor: [180,180,180] },
          columnStyles: { 0: { halign: 'right', fontStyle: 'bold', cellWidth: 40 }, 1: { halign: 'right', cellWidth: 30 } },
          tableWidth: 70,
          margin: { left: pageW - margin - 70 },
        });

        // TOTAL FINAL
        const yTotal = doc.lastAutoTable.finalY;
        autoTable(doc, {
          startY: yTotal,
          body: [['TOTAL RD$', total.toLocaleString('en-US',{minimumFractionDigits:2})]],
          styles: { fontSize: 11, cellPadding: 3, fontStyle: 'bold', lineWidth: 0.3, lineColor: [180,180,180] },
          bodyStyles: { fillColor: [240,240,240] },
          columnStyles: { 0: { halign: 'right', cellWidth: 40 }, 1: { halign: 'right', cellWidth: 30 } },
          tableWidth: 70,
          margin: { left: pageW - margin - 70 },
        });

        // ── NOTA ──
        if (cotNota) {
          const yNota = doc.lastAutoTable.finalY + 8;
          doc.setFontSize(9); doc.setTextColor(100,116,139); doc.setFont(undefined,'italic');
          doc.text(`Nota: ${cotNota}`, margin, yNota, { maxWidth: 180 });
        }

        // ── GUARDAR Y DESCARGAR ──
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

  // ─── GENERACIÓN MASIVA DE COTIZACIONES ───────────────────
  const iniciarGenMasiva = async () => {
    const emp = empresaActual || {};
    const clientesConPlantilla = clientes.filter(c => COT_PLANTILLAS[c.id]);
    if (!clientesConPlantilla.length) { showToast('No hay clientes con plantilla disponible', 'error'); return; }

    setGenMasivaActivo(true);
    setGenMasivaLog([]);
    setGenMasivaProgreso({ total: clientesConPlantilla.length, done: 0, ok: 0, error: 0 });

    const { default: jsPDF } = await import('jspdf');
    const autotableModule = await import('jspdf-autotable');
    const autoTable = autotableModule.default || autotableModule;

    let numBase = emp.numero_cotizacion || 1;
    let ok = 0, errores = 0;

    for (const cliente of clientesConPlantilla) {
      const items = COT_PLANTILLAS[cliente.id];
      const numStr = String(numBase).padStart(6, '0');
      const pageW = 210, margin = 15;
      const fecha = new Date();

      try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        if (emp.logo_url) { try { doc.addImage(emp.logo_url, 'PNG', margin, 10, 35, 20); } catch(e) {} }

        doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.setTextColor(30,30,30);
        doc.text(emp.nombre || 'Mi Empresa', margin + (emp.logo_url ? 38 : 0), 16);
        doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
        let dyEmp = 22;
        if (emp.direccion) { doc.text(emp.direccion, margin + (emp.logo_url ? 38 : 0), dyEmp); dyEmp += 5; }
        if (emp.ciudad)    { doc.text(emp.ciudad, margin + (emp.logo_url ? 38 : 0), dyEmp); dyEmp += 5; }
        if (emp.telefono)  { doc.text(`Tel. ${emp.telefono}`, margin + (emp.logo_url ? 38 : 0), dyEmp); dyEmp += 5; }
        if (emp.rnc)       { doc.text(`RNC: ${emp.rnc}`, margin + (emp.logo_url ? 38 : 0), dyEmp); }

        doc.setFont(undefined, 'bold'); doc.setFontSize(22); doc.setTextColor(30,30,30);
        doc.text('COTIZACION', pageW - margin, 18, { align: 'right' });

        autoTable(doc, { startY: 32, head: [['FECHA','NUMERO']], body: [[fecha.toLocaleDateString('es-DO'), numStr]], styles: { fontSize:9, cellPadding:2, halign:'center' }, headStyles: { fillColor:[255,255,255], textColor:[30,30,30], fontStyle:'bold', lineWidth:0.3, lineColor:[180,180,180] }, bodyStyles: { lineWidth:0.3, lineColor:[180,180,180] }, tableWidth:70, margin: { left: pageW - margin - 70 } });
        autoTable(doc, { startY: 46, head: [['CLIENTE:','CONTACTO','TIEMPO DE ENTREGA']], body: [[cliente.nombre, cliente.contacto || '', 'Válida 30 días']], styles: { fontSize:9, cellPadding:3 }, headStyles: { fillColor:[255,255,255], textColor:[30,30,30], fontStyle:'bold', lineWidth:0.3, lineColor:[180,180,180] }, bodyStyles: { lineWidth:0.3, lineColor:[180,180,180] }, margin: { left:margin, right:margin } });
        autoTable(doc, { startY: doc.lastAutoTable.finalY, head: [['VENDEDOR','CONDICIONES','DESCTO %']], body: [[emp.vendedor || session?.user?.nombre || 'Vendedor','CONTADO','0.00']], styles: { fontSize:9, cellPadding:3 }, headStyles: { fillColor:[255,255,255], textColor:[30,30,30], fontStyle:'bold', lineWidth:0.3, lineColor:[180,180,180] }, bodyStyles: { lineWidth:0.3, lineColor:[180,180,180] }, margin: { left:margin, right:margin } });

        const subtotal = items.reduce((s, it) => s + (parseFloat(it.precio)||0) * (parseFloat(it.cantidad)||1), 0);
        const total = subtotal;

        autoTable(doc, { startY: doc.lastAutoTable.finalY + 2, head: [['CODIGO','DESCRIPCION','CANTIDAD','U/M','PRECIO','TOTAL']], body: [...items.map(it => { const p=parseFloat(it.precio)||0, q=parseFloat(it.cantidad)||1; return [it.codigo||'—', it.descripcion, q.toFixed(2), it.um||'UND', p.toLocaleString('en-US',{minimumFractionDigits:2}), (p*q).toLocaleString('en-US',{minimumFractionDigits:2})]; }), ...Array(Math.max(0,10-items.length)).fill(['','','','','',''])], styles:{fontSize:9,cellPadding:3}, headStyles:{fillColor:[255,255,255],textColor:[30,30,30],fontStyle:'bold',lineWidth:0.3,lineColor:[180,180,180]}, bodyStyles:{lineWidth:0.3,lineColor:[180,180,180]}, columnStyles:{0:{cellWidth:22},2:{halign:'right'},3:{halign:'center',cellWidth:15},4:{halign:'right'},5:{halign:'right',fontStyle:'bold'}}, margin:{left:margin,right:margin} });
        autoTable(doc, { startY: doc.lastAutoTable.finalY, body: [['TOTAL BRUTO',subtotal.toLocaleString('en-US',{minimumFractionDigits:2})],['DESCUENTO','0.00'],['SUB TOTAL',subtotal.toLocaleString('en-US',{minimumFractionDigits:2})],['ITBIS (18%)','0.00']], styles:{fontSize:9,cellPadding:2,lineWidth:0.3,lineColor:[180,180,180]}, columnStyles:{0:{halign:'right',fontStyle:'bold',cellWidth:40},1:{halign:'right',cellWidth:30}}, tableWidth:70, margin:{left:pageW-margin-70} });
        autoTable(doc, { startY: doc.lastAutoTable.finalY, body: [['TOTAL RD$',total.toLocaleString('en-US',{minimumFractionDigits:2})]], styles:{fontSize:11,cellPadding:3,fontStyle:'bold',lineWidth:0.3,lineColor:[180,180,180]}, bodyStyles:{fillColor:[240,240,240]}, columnStyles:{0:{halign:'right',cellWidth:40},1:{halign:'right',cellWidth:30}}, tableWidth:70, margin:{left:pageW-margin-70} });

        doc.setFontSize(9); doc.setTextColor(100,116,139); doc.setFont(undefined,'italic');
        doc.text('Nota: Precios sujetos a cambio sin previo aviso.', margin, doc.lastAutoTable.finalY + 8, { maxWidth: 180 });

        const pdfNombre = `cotizacion-${cliente.nombre.replace(/ /g,'-')}-${numStr}.pdf`;
        const base64 = doc.output('datauristring');

        const res = await fetch(`/api/cotizaciones/${cliente.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: pdfNombre, base64, monto: total, fecha: fecha.toISOString(), estado: 'Cotizado', tipo: 'generado' }),
        });

        if (res.ok) {
          ok++;
          numBase++;
          setCotizaciones(prev => ({ ...prev, [cliente.id]: [...(prev[cliente.id] || []), { id: Date.now() + ok, nombre: pdfNombre, base64, fecha: fecha.toISOString(), monto: total, tipo: 'generado', numCot: numStr }] }));
          setGenMasivaLog(prev => [...prev, { cliente: cliente.nombre, estado: 'ok', monto: total }]);
        } else {
          errores++;
          setGenMasivaLog(prev => [...prev, { cliente: cliente.nombre, estado: 'error', msg: `HTTP ${res.status}` }]);
        }
      } catch(e) {
        errores++;
        setGenMasivaLog(prev => [...prev, { cliente: cliente.nombre, estado: 'error', msg: e.message }]);
      }

      setGenMasivaProgreso({ total: clientesConPlantilla.length, done: ok + errores, ok, error: errores });
      // Pequeña pausa para no saturar el navegador
      await new Promise(r => setTimeout(r, 50));
    }

    setGenMasivaActivo(false);
    showToast(`Generadas ${ok} cotizaciones${errores > 0 ? `, ${errores} errores` : ''}`, ok > 0 ? 'success' : 'error');
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
    // 2. Buscar por nombre completo — ordenar de mayor a menor longitud para evitar
    //    que "Carlos" haga match antes que "Carlos Javier Rodriguez Fernandez"
    const porLongitud = [...clientes].sort((a, b) => (b.nombre||'').length - (a.nombre||'').length);
    const match = porLongitud.find(c => c.nombre && nombre.includes(c.nombre.toLowerCase().replace(/[-_]/g, ' ')));
    if (match) return { cliente: match, confianza: 'alta', razon: `Nombre "${match.nombre}" en el archivo` };
    // 3. Coincidencia parcial — también por longitud descendente
    const matchParcial = porLongitud.find(c => {
      const palabras = (c.nombre || '').toLowerCase().split(' ');
      return palabras.some(p => p.length > 3 && nombre.includes(p));
    });
    if (matchParcial) return { cliente: matchParcial, confianza: 'media', razon: `Coincidencia parcial con "${matchParcial.nombre}"` };
    return null;
  };

  const procesarArchivosMasivos = async (files) => {
    if (!files || files.length === 0) return;
    const validos = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (validos.length === 0) { showToast('Selecciona archivos PDF', 'error'); return; }
    if (validos.length > 200) { showToast('Máximo 200 archivos a la vez', 'error'); return; }
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
        const clienteAsignado = deteccion ? deteccion.cliente : null;
        // Si el cliente ya tiene documento asignado → omitir automáticamente
        const yaConDoc = clienteAsignado && clientesConDoc.has(clienteAsignado.id);
        const montoDetectado = yaConDoc ? null : await extraerMontoPDF(base64);
        resolve({
          id: Date.now() + Math.random(),
          nombre: file.name,
          base64: yaConDoc ? null : base64, // no guardamos el base64 si se va a omitir
          clienteDetectado: deteccion,
          clienteAsignado,
          estado: yaConDoc ? 'ya-tiene-doc' : deteccion ? (deteccion.confianza === 'alta' ? 'vinculado' : 'sugerido') : 'sin-vincular',
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

  const abrirCargaMasiva = async () => {
    setArchivosEnProceso([]);
    setShowCargaMasivaModal(true);
    try {
      const res = await fetch('/api/cotizaciones/ids-con-doc');
      const data = await res.json();
      setClientesConDoc(new Set(data.ids || []));
    } catch { setClientesConDoc(new Set()); }
  };

  const confirmarCargaMasiva = async () => {
    let guardados = 0; let errores = 0; let omitidos = 0;
    setShowCargaMasivaModal(false);
    setArchivosEnProceso([]);
    const paraGuardar = archivosEnProceso.filter(arch => {
      if (arch.estado === 'ya-tiene-doc') { omitidos++; return false; }
      if (!arch.base64 || !arch.clienteAsignado) { errores++; return false; }
      return true;
    });
    for (const arch of paraGuardar) {
      const fecha = new Date().toISOString();
      const nueva = { id: Date.now() + Math.random(), nombre: arch.nombre, base64: arch.base64, fecha, monto: arch.montoDetectado || null, tipo: 'subido', estado: 'Cotizado' };
      setCotizaciones(prev => ({ ...prev, [arch.clienteAsignado.id]: [...(prev[arch.clienteAsignado.id] || []), nueva] }));
      try {
        const res = await fetch(`/api/cotizaciones/${arch.clienteAsignado.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: arch.nombre, base64: arch.base64, monto: arch.montoDetectado || null, fecha, estado: 'Cotizado', tipo: 'subido' }),
        });
        if (res.ok) {
          const saved = await res.json();
          setCotizaciones(prev => ({ ...prev, [arch.clienteAsignado.id]: (prev[arch.clienteAsignado.id] || []).map(d => d.id === nueva.id ? { ...d, id: saved.id } : d) }));
          guardados++;
          if (arch.montoDetectado) {
            const clienteActual = clientes.find(c => c.id === arch.clienteAsignado.id);
            if (clienteActual) actualizarCliente({ ...clienteActual, monto: arch.montoDetectado.toString() });
          }
        } else {
          errores++;
          setCotizaciones(prev => ({ ...prev, [arch.clienteAsignado.id]: (prev[arch.clienteAsignado.id] || []).filter(d => d.id !== nueva.id) }));
        }
      } catch {
        errores++;
        setCotizaciones(prev => ({ ...prev, [arch.clienteAsignado.id]: (prev[arch.clienteAsignado.id] || []).filter(d => d.id !== nueva.id) }));
      }
    }
    const msg = [
      guardados > 0 ? `${guardados} documento${guardados !== 1 ? 's' : ''} guardado${guardados !== 1 ? 's' : ''}` : null,
      omitidos > 0 ? `${omitidos} omitido${omitidos !== 1 ? 's' : ''} (ya tenían documento)` : null,
      errores > 0 ? `${errores} no se pudo${errores !== 1 ? 'n' : ''} guardar` : null,
    ].filter(Boolean).join(' · ');
    showToast(msg, errores > 0 && guardados === 0 ? 'error' : guardados > 0 ? 'success' : 'info');
  };

  const vincularDocumento = async (doc, nuevoClienteId) => {
    if (!nuevoClienteId || nuevoClienteId === doc.clienteId) return;
    setVincularLoading(doc.id);
    try {
      const res = await fetch(`/api/cotizaciones/${doc.clienteId}/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: parseInt(nuevoClienteId) }),
      });
      if (res.ok) {
        setCotizaciones(prev => {
          const oldDocs = (prev[doc.clienteId] || []).filter(d => d.id !== doc.id);
          const newDoc  = { ...doc, clienteId: parseInt(nuevoClienteId) };
          const newDocs = [...(prev[nuevoClienteId] || []), newDoc];
          return { ...prev, [doc.clienteId]: oldDocs, [parseInt(nuevoClienteId)]: newDocs };
        });
        setVincularSelects(prev => { const n = { ...prev }; delete n[doc.id]; return n; });
        showToast('Documento vinculado correctamente', 'success');
      } else { showToast('Error al vincular documento', 'error'); }
    } catch { showToast('Error al vincular documento', 'error'); }
    setVincularLoading(null);
  };

  const borrarDocsAgente = async (username) => {
    if (!confirm(`¿Eliminar TODOS los documentos de @${username} y reiniciar sus clientes?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch('/api/admin/borrar-docs-agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        const data = await res.json();
        const clientesAgente = datosActuales.clientes.filter(c => c.creadoPor === username);
        setCotizaciones(prev => {
          const next = { ...prev };
          clientesAgente.forEach(c => { delete next[c.id]; });
          return next;
        });
        await cargarClientes();
        showToast(`Documentos eliminados · ${data.reset || 0} clientes reiniciados`, 'success');
      } else { showToast('Error al eliminar documentos', 'error'); }
    } catch { showToast('Error al eliminar documentos', 'error'); }
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
      cargarUsuariosAdmin();
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
    if (res.ok) { await cargarUsuarios(); cargarUsuariosAdmin(); showToast(`Usuario ${key} eliminado`, 'info'); }
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
    setAuditError('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res  = await fetch('/api/audit?lines=150', { signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) {
        setAuditError(data.error || `Error ${res.status}`);
        setAuditEntries([]);
      } else {
        setAuditEntries(data.entries || []);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        setAuditError('La consulta tardó demasiado (>12 s). Revisa la conexión con Supabase.');
      } else {
        setAuditError('Error de conexión al cargar la bitácora.');
      }
      setAuditEntries([]);
    }
    setAuditLoading(false);
  };

  // ─── BITÁCORA DE GESTIONES ───────────────────────────────
  const ROLES_PANEL = [
    { key: 'editor',                  label: 'Editor' },
    { key: 'agente_cobro',            label: 'Agente Cobro' },
    { key: 'contabilidad',            label: 'Contabilidad' },
    { key: 'supervisor_cobro',        label: 'Sup. Cobro' },
    { key: 'supervisor_contabilidad', label: 'Sup. Contab.' },
    { key: 'viewer',                  label: 'Viewer' },
  ];
  const PERMISOS_LISTA = [
    { key: 'ver_clientes',          label: 'Ver clientes' },
    { key: 'crear_clientes',        label: 'Crear clientes' },
    { key: 'editar_clientes',       label: 'Editar clientes' },
    { key: 'eliminar_clientes',     label: 'Eliminar clientes' },
    { key: 'ver_montos',            label: 'Ver montos' },
    { key: 'registrar_pagos',       label: 'Registrar pagos' },
    { key: 'ver_creditos',          label: 'Ver créditos' },
    { key: 'crear_creditos',        label: 'Crear créditos' },
    { key: 'ver_documentos',        label: 'Ver documentos' },
    { key: 'subir_documentos',      label: 'Subir documentos' },
    { key: 'ver_reportes_pdf',      label: 'Ver reportes PDF' },
    { key: 'acceder_delegaciones',  label: 'Delegaciones' },
    { key: 'ver_conciliacion',      label: 'Conciliación bancaria' },
    { key: 'acceder_configuracion', label: 'Configuración' },
  ];
  const togglePermiso = async (rol, permiso, activoActual) => {
    const nuevoActivo = !activoActual;
    setPermisosRol(prev => ({ ...prev, [rol]: { ...(prev[rol] || {}), [permiso]: nuevoActivo } }));
    try {
      await fetch('/api/permisos-rol', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rol, permiso, activo: nuevoActivo }) });
    } catch { /* silencioso */ }
  };

  const TIPOS_GESTION = ['Llamada', 'WhatsApp', 'Visita', 'Email', 'Otro'];
  const RESULTADOS_GESTION = ['Contestó', 'No Contestó', 'Buzón de Voz', 'Promesa de Pago', 'Pago Recibido', 'Rechazó', 'Sin Respuesta'];
  const COLOR_RESULTADO = { 'Contestó':'#059669','No Contestó':'#dc2626','Buzón de Voz':'#6b7280','Promesa de Pago':'#d97706','Pago Recibido':'#16a34a','Rechazó':'#dc2626','Sin Respuesta':'#9ca3af' };

  const abrirGestionModal = (cliente) => {
    setGestionClienteId(cliente.id);
    setGestionTipo('Llamada'); setGestionResultado('Contestó');
    setGestionNota(''); setGestionProximaFecha('');
    setShowGestionModal(true);
    if (!gestiones[cliente.id]) {
      fetch(`/api/gestiones/${cliente.id}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setGestiones(prev => ({ ...prev, [cliente.id]: data })))
        .catch(() => {});
    }
  };
  const guardarGestion = async () => {
    if (!gestionClienteId) return;
    const nueva = { id: Date.now(), fecha: new Date().toISOString(), tipo: gestionTipo, resultado: gestionResultado, nota: gestionNota, proximaFecha: gestionProximaFecha, usuario: currentUser || session?.user?.username || 'Usuario' };
    setGestiones(prev => ({ ...prev, [gestionClienteId]: [nueva, ...(prev[gestionClienteId] || [])] }));
    setShowGestionModal(false);
    showToast(`Gestión registrada: ${gestionResultado}`, 'success');
    try {
      const res = await fetch(`/api/gestiones/${gestionClienteId}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fecha: nueva.fecha, tipo: gestionTipo, resultado: gestionResultado, nota: gestionNota, proximaFecha: gestionProximaFecha }) });
      if (res.ok) { const saved = await res.json(); setGestiones(prev => ({ ...prev, [gestionClienteId]: (prev[gestionClienteId]||[]).map(g => g.id === nueva.id ? { ...g, id: saved.id } : g) })); }
    } catch { /* fire and forget */ }
  };
  const ultimaGestion = (clienteId) => (gestiones[clienteId] || [])[0] || null;
  const tieneProximoSeguimiento = (clienteId) => {
    const g = ultimaGestion(clienteId);
    if (!g || !g.proximaFecha) return false;
    return new Date(g.proximaFecha) <= new Date(new Date().setHours(23,59,59,999));
  };

  // ─── PLANTILLAS WHATSAPP ──────────────────────────────────
  const getSaludo = () => {
    const h = new Date().getHours();
    return (h >= 0 && h < 12) ? 'Buenos Días' : 'Buenas Tardes';
  };
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const getMesFactura = () => { const d = new Date(); const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); return `${MESES[p.getMonth()].toUpperCase()} ${p.getFullYear()}`; };
  const getMesLimite = () => { const d = new Date(); return `15 DE ${MESES[d.getMonth()].toUpperCase()} ${d.getFullYear()}`; };
  const getMsgRecordatorio = () => {
    const d = new Date();
    const mes = MESES[d.getMonth()].toUpperCase();
    const anio = d.getFullYear();
    const suspension = new Date(d.getFullYear(), d.getMonth(), 18);
    const diaSemana = suspension.getDay();
    if (diaSemana === 6) suspension.setDate(20);
    else if (diaSemana === 0) suspension.setDate(19);
    const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const nombreDia = DIAS[suspension.getDay()];
    const diaSusp = suspension.getDate();
    return `⚠️ Atención ⚠️\n\nEstimado Cliente, es bien informarle.\n\nQue la Fecha límite de pago finaliza el *15 de ${mes} del ${anio}*. Si ya realizó su pago favor notificarlo.\n\nDe no realizar el pago a partir del día 15, el servicio entrará en suspensión el día *${nombreDia} ${diaSusp} de ${mes} del ${anio}* a partir de las 10 AM.\n\nMuchas Gracias de antemano!!`;
  };
  const getMsgFactura = (cliente) => `Saludos ${getSaludo()}!\n\nLa factura por *EL MES DE ${getMesFactura()}*📃 ha sido generada.\n\n💠Recordandole: que la misma tiene un plazo hasta el dia ${getMesLimite()} para el pago.\n\n💰 Monto a pagar: *$${(parseFloat(cliente.monto)||0).toLocaleString('en-US',{minimumFractionDigits:2})}*\n\n⚠LOS PAGOS SE REALIZAN A NUESTRAS CUENTAS DE BANCOS⚠\n\nCUENTAS:\nA nombre: 7LABS\n🟢Reservas: 248 013348 5\n🔵Popular:     782 6584 05\n🟢BHD:         1587 811 0015\n\n🧾RNC: 130-82698-6`;

  const aplicarPlantilla = (texto, cliente) => texto
    .replace(/{nombre}/g, cliente.nombre)
    .replace(/{monto}/g, (parseFloat(cliente.monto)||0).toLocaleString('en-US'))
    .replace(/{estado}/g, cliente.estado)
    .replace(/{id}/g, cliente.id)
    .replace(/{saludo}/g, getSaludo())
    .replace(/{mes}/g, getMesFactura())
    .replace(/{limite}/g, getMesLimite());

  const guardarPlantilla = async () => {
    if (!plantillaForm.nombre.trim() || !plantillaForm.texto.trim()) return;
    if (plantillaEditando) {
      setPlantillas(prev => prev.map(p => p.id === plantillaEditando ? { ...p, ...plantillaForm } : p));
      fetch(`/api/plantillas/${plantillaEditando}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(plantillaForm) }).catch(() => {});
    } else {
      const temp = { id: Date.now(), ...plantillaForm };
      setPlantillas(prev => [...prev, temp]);
      try {
        const res = await fetch('/api/plantillas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(plantillaForm) });
        if (res.ok) { const saved = await res.json(); setPlantillas(prev => prev.map(p => p.id === temp.id ? saved : p)); }
      } catch { /* fire and forget */ }
    }
    setPlantillaEditando(null); setPlantillaForm({ nombre: '', texto: '' });
    showToast('Plantilla guardada', 'success');
  };
  const eliminarPlantilla = (id) => {
    setPlantillas(prev => prev.filter(p => p.id !== id));
    fetch(`/api/plantillas/${id}`, { method:'DELETE' }).catch(() => {});
  };

  // ─── WHATSAPP MASIVO ──────────────────────────────────────
  const toggleSeleccion = (id) => setClientesSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleTodos = () => setClientesSeleccionados(prev => prev.length === clientesPaginados.length ? [] : clientesPaginados.map(c => c.id));

  const iniciarWaMasivo = () => {
    if (clientesSeleccionados.length === 0) { showToast('Selecciona al menos un cliente', 'error'); return; }
    setWaMasivoMensaje(''); setWaMasivoIndex(0); setWaMasivoActivo(false);
    setShowWaMasivoModal(true);
  };
  const enviarWaMasivo = async () => {
    const destinos = clientes.filter(c => clientesSeleccionados.includes(c.id) && c.contacto);
    if (destinos.length === 0) { showToast('Los clientes seleccionados no tienen contacto', 'error'); return; }
    setWaMasivoActivo(true);
    setWaMasivoIndex(0);
    setWaMasivoListoSiguiente(false);
    // Enviar el primero
    await enviarWaMasivoUno(destinos, 0);
  };

  const enviarWaMasivoUno = async (destinos, i) => {
    if (i >= destinos.length) {
      showToast(`${destinos.length} clientes notificados`, 'success');
      setWaMasivoActivo(false); setShowWaMasivoModal(false); setClientesSeleccionados([]);
      if (waMasivoEsRecordatorio) {
        const hoy = new Date();
        const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: 'recordatorio_mes_enviado', valor: mes }) });
        setRecordatorioActivo(false);
        setWaMasivoEsRecordatorio(false);
        showToast('Recordatorio completado — banner cerrado para todos', 'success');
      }
      return;
    }
    const c = destinos[i];
    const msg = waMasivoMensaje.trim() ? waMasivoMensaje : getMsgFactura(c);
    const num = c.contacto.replace(/\D/g, '');

    // Cargar documento si existe
    let doc = null;
    try {
      const docs = cotizaciones[c.id] || [];
      let lista = docs;
      if (lista.length === 0) {
        const r = await fetch(`/api/cotizaciones/${c.id}`);
        if (r.ok) { lista = await r.json(); setCotizaciones(prev => ({ ...prev, [c.id]: lista })); }
      }
      // Obtener base64 si falta
      const ultimo = lista[lista.length - 1] || null;
      if (ultimo && !ultimo.base64) {
        const r2 = await fetch(`/api/cotizaciones/${c.id}`);
        if (r2.ok) { const full = await r2.json(); setCotizaciones(prev => ({ ...prev, [c.id]: full })); doc = full[full.length - 1] || null; }
      } else { doc = ultimo; }
    } catch { doc = null; }

    if (window.electronAPI?.isElectron && doc?.base64) {
      await window.electronAPI.sendPDFWhatsApp(doc.base64, doc.nombre, num, msg);
    } else {
      if (doc?.base64) descargarDocumento(doc);
      window.open(`https://wa.me/1${num}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    setWaMasivoIndex(i);
    setWaMasivoDestinosActual(destinos);
    setWaMasivoListoSiguiente(true);
  };

  const siguienteWaMasivo = () => {
    const destinos = waMasivoDestinosActual;
    const i = waMasivoIndex;
    marcarNotificado(destinos[i]);
    setWaMasivoEnviados(prev => prev + 1);
    setWaMasivoListoSiguiente(false);
    enviarWaMasivoUno(destinos, i + 1);
  };

  // ─── ESTADO DE CUENTA PDF ─────────────────────────────────
  const generarEstadoCuentaPDF = (cliente) => {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then((autotableModule) => { const autoTable = autotableModule.default || autotableModule;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const s = calcularSaldoCliente(cliente);
        // Header
        doc.setFillColor(15,28,63); doc.rect(0,0,210,40,'F');
        doc.setTextColor(255,255,255); doc.setFontSize(20); doc.setFont(undefined,'bold');
        doc.text('PayTrack', 15, 16);
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
  const AVATAR_COLORS = [
    'linear-gradient(135deg,#635bff,#818cf8)',
    'linear-gradient(135deg,#f97316,#fb923c)',
    'linear-gradient(135deg,#059669,#34d399)',
    'linear-gradient(135deg,#0284c7,#38bdf8)',
    'linear-gradient(135deg,#dc2626,#f87171)',
    'linear-gradient(135deg,#8b5cf6,#a78bfa)',
    'linear-gradient(135deg,#14b8a6,#2dd4bf)',
    'linear-gradient(135deg,#f59e0b,#fbbf24)',
    'linear-gradient(135deg,#e11d48,#fb7185)',
    'linear-gradient(135deg,#0891b2,#22d3ee)',
  ];
  const getAvatar = (nombre) => {
    const idx = (nombre || '?').charCodeAt(0) % AVATAR_COLORS.length;
    return { letra: (nombre || '?')[0].toUpperCase(), color: AVATAR_COLORS[idx] };
  };

  // ─── TAGS ─────────────────────────────────────────────────
  const TAG_PREDEFINIDOS = ['VIP', 'Prioritario', 'Nuevo', 'Problema', 'Regular'];
  const TAG_CLASSES = { 'VIP': 'vip', 'Prioritario': 'prioritario', 'Nuevo': 'nuevo', 'Problema': 'problema' };
  const agregarTag = (clienteId, tag) => {
    if (!tag.trim()) return;
    const actuales = tags[clienteId] || clientes.find(c => c.id === clienteId)?.tags || [];
    if (actuales.includes(tag)) return;
    const nuevos = [...actuales, tag.trim()];
    setTags(t => ({ ...t, [clienteId]: nuevos }));
    const cliente = clientes.find(c => c.id === clienteId);
    if (cliente) actualizarCliente({ ...cliente, tags: nuevos });
  };
  const eliminarTag = (clienteId, tag) => {
    const nuevos = (tags[clienteId] || []).filter(x => x !== tag);
    setTags(t => ({ ...t, [clienteId]: nuevos }));
    const cliente = clientes.find(c => c.id === clienteId);
    if (cliente) actualizarCliente({ ...cliente, tags: nuevos });
  };

  // ─── RESUMEN EJECUTIVO PDF ────────────────────────────────
  const generarResumenPDF = () => {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then((autotableModule) => { const autoTable = autotableModule.default || autotableModule;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const mesNombre = obtenerNombreMes(mesVisualizando);
        // Header
        doc.setFillColor(15, 28, 63); doc.rect(0, 0, 210, 45, 'F');
        doc.setTextColor(255,255,255); doc.setFontSize(22); doc.setFont(undefined,'bold');
        doc.text('PayTrack', 15, 18);
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
          doc.text('PayTrack — Reporte Confidencial', 15, 287);
          doc.text(`Página ${i} de ${totalPages}`, 170, 287);
        }
        doc.save(`resumen-ejecutivo-${mesVisualizando}.pdf`);
        showToast('Resumen ejecutivo generado', 'success');
      });
    });
  };

  // ── Cerrar user menu al clic fuera ──────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.user-menu-container')) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  // ────────────────────────────────────────────────────────────

  // ── Ticker de notificaciones ────────────────────────────────
  useEffect(() => {
    if (!clientes.length) return;
    const items = [];

    const pagados = clientes.filter(c => c.estado === 'Pagado');
    pagados.forEach(c => {
      items.push({ icon: '💳', text: `${c.nombre} está pendiente de facturar`, color: '#22c55e' });
    });

    const cotizados = clientes.filter(c => c.estado === 'Cotizado');
    if (cotizados.length <= 3) {
      cotizados.forEach(c => {
        items.push({ icon: '🟠', text: `${c.nombre} está pendiente de notificar`, color: '#f97316' });
      });
    } else {
      items.push({ icon: '🟠', text: `${cotizados.length} clientes cotizados pendientes de notificar`, color: '#f97316' });
    }

    const notificados = clientes.filter(c => c.estado === 'Notificado');
    if (notificados.length <= 3) {
      notificados.forEach(c => {
        items.push({ icon: '💬', text: `${c.nombre} está notificado — esperando pago`, color: '#6366f1' });
      });
    } else {
      items.push({ icon: '💬', text: `${notificados.length} clientes notificados esperando pago`, color: '#6366f1' });
    }

    const creditosVencidos = creditos.filter(c => c.estado === 'Vencido');
    creditosVencidos.slice(0, 5).forEach(c => {
      items.push({ icon: '🔴', text: `Crédito de ${c.cliente || c.nombre || '—'} está vencido`, color: '#ef4444' });
    });

    const creditosPorVencer = creditos.filter(c => c.estado === 'Por Vencer');
    creditosPorVencer.slice(0, 5).forEach(c => {
      const dias = c.fechaVencimiento ? Math.ceil((new Date(c.fechaVencimiento) - new Date()) / (1000 * 60 * 60 * 24)) : null;
      const diasText = dias !== null ? ` — vence en ${dias}d` : '';
      items.push({ icon: '🟡', text: `Crédito de ${c.cliente || c.nombre || '—'} por vencer${diasText}`, color: '#f59e0b' });
    });

    const vencidos = clientes.filter(c => c.estado === 'Vencido');
    if (vencidos.length > 0) {
      items.push({ icon: '⚠️', text: `${vencidos.length} clientes vencidos requieren atención`, color: '#ef4444' });
    }

    notasDashboard.forEach(n => {
      items.push({ icon: '📝', text: `${n.nombre || n.usuario}: ${n.texto}`, color: '#06b6d4' });
    });

    if (items.length === 0) {
      items.push({ icon: '✨', text: 'Todo al día — sin pendientes', color: '#22c55e' });
    }

    setTickerItems(items);
    setTickerIndex(0);
  }, [clientes, creditos, notasDashboard]);

  useEffect(() => {
    if (tickerItems.length === 0) return;
    const interval = setInterval(() => {
      setTickerVisible(false);
      setTimeout(() => {
        setTickerIndex(prev => (prev + 1) % tickerItems.length);
        setTickerVisible(true);
      }, 400);
    }, 5000);
    return () => clearInterval(interval);
  }, [tickerItems]);
  // ────────────────────────────────────────────────────────────

  if (!hydrated || sessionStatus === 'loading') return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f0f3f8', fontSize: '1.1rem', color: '#64748b' }}>Cargando...</div>;

  if (!isAuthenticated && !session) {
    return (
      <div className="login-container" style={{ position: 'relative', zIndex: 1, isolation: 'isolate' }}>
        {/* Fondo animado con gráficas */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: '#0a0f1e', overflow: 'hidden' }}>
          <svg width="100%" height="100%" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="line1grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0"/>
                <stop offset="50%" stopColor="#4f46e5" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="line2grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0"/>
                <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.6"/>
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="line3grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#d97706" stopOpacity="0"/>
                <stop offset="50%" stopColor="#d97706" stopOpacity="0.5"/>
                <stop offset="100%" stopColor="#d97706" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="fillgrad1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="fillgrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.1"/>
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="fillgrad3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d97706" stopOpacity="0.08"/>
                <stop offset="100%" stopColor="#d97706" stopOpacity="0"/>
              </linearGradient>
              <radialGradient id="glow1" cx="30%" cy="20%" r="40%">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="glow2" cx="70%" cy="30%" r="35%">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.1"/>
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"/>
              </radialGradient>
            </defs>

            {/* Grid lines */}
            {[150,300,450,600,750].map((y, i) => (
              <line key={`h${i}`} x1="0" y1={y} x2="1440" y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
            ))}
            {[180,360,540,720,900,1080,1260].map((x, i) => (
              <line key={`v${i}`} x1={x} y1="0" x2={x} y2="900" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
            ))}

            {/* Línea 1 — Índigo (principal) */}
            <path d="M0,650 C180,620 240,400 360,380 C480,360 520,500 600,480 C680,460 720,300 840,250 C960,200 1000,350 1080,320 C1160,290 1300,180 1440,160 L1440,900 L0,900 Z" fill="url(#fillgrad1)">
              <animateTransform attributeName="transform" type="translate" values="0,0;-20,15;0,0" dur="8s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
            </path>
            <path d="M0,650 C180,620 240,400 360,380 C480,360 520,500 600,480 C680,460 720,300 840,250 C960,200 1000,350 1080,320 C1160,290 1300,180 1440,160" fill="none" stroke="url(#line1grad)" strokeWidth="2.5">
              <animateTransform attributeName="transform" type="translate" values="0,0;-20,15;0,0" dur="8s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
            </path>

            {/* Línea 2 — Morado */}
            <path d="M0,750 C120,700 200,550 320,500 C440,450 500,600 620,570 C740,540 800,400 900,370 C1000,340 1100,450 1200,420 C1300,390 1380,300 1440,280 L1440,900 L0,900 Z" fill="url(#fillgrad2)">
              <animateTransform attributeName="transform" type="translate" values="0,0;15,-10;0,0" dur="11s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
            </path>
            <path d="M0,750 C120,700 200,550 320,500 C440,450 500,600 620,570 C740,540 800,400 900,370 C1000,340 1100,450 1200,420 C1300,390 1380,300 1440,280" fill="none" stroke="url(#line2grad)" strokeWidth="2">
              <animateTransform attributeName="transform" type="translate" values="0,0;15,-10;0,0" dur="11s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
            </path>

            {/* Línea 3 — Ámbar */}
            <path d="M0,820 C200,780 280,650 400,620 C520,590 580,700 700,670 C820,640 880,520 980,490 C1080,460 1180,560 1280,530 C1360,510 1410,440 1440,420" fill="none" stroke="url(#line3grad)" strokeWidth="1.5">
              <animateTransform attributeName="transform" type="translate" values="0,0;-10,20;0,0" dur="14s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
            </path>

            {/* Puntos picos — Línea 1 */}
            {[[360,380],[600,480],[840,250],[1080,320],[1440,160]].map(([x,y], i) => (
              <circle key={`p1${i}`} cx={x} cy={y} r="3.5" fill="#4f46e5" opacity="0.7">
                <animate attributeName="opacity" values="0.7;1;0.7" dur={`${3+i}s`} repeatCount="indefinite"/>
                <animate attributeName="r" values="3.5;5;3.5" dur={`${3+i}s`} repeatCount="indefinite"/>
              </circle>
            ))}

            {/* Puntos picos — Línea 2 */}
            {[[320,500],[620,570],[900,370],[1200,420]].map(([x,y], i) => (
              <circle key={`p2${i}`} cx={x} cy={y} r="3" fill="#7c3aed" opacity="0.6">
                <animate attributeName="opacity" values="0.6;1;0.6" dur={`${4+i}s`} repeatCount="indefinite"/>
              </circle>
            ))}

            <rect width="1440" height="900" fill="url(#glow1)"/>
            <rect width="1440" height="900" fill="url(#glow2)"/>
          </svg>
        </div>
        <div className="login-box" style={{ position: 'relative', zIndex: 2 }}>
          <div className="login-header">
            <div className="login-logo"><BarChart2 size={34} strokeWidth={2}/></div>
            <h1 className="login-title"><span className="logo-carta">Pay</span><span className="logo-master">Track</span></h1>
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
            <button type="submit" className="login-btn">Iniciar Sesión</button>
          </form>
        </div>
        <p className="login-footer" style={{ position: 'relative', zIndex: 2 }}>© 2026 PayTrack · Todos los derechos reservados</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* ── ELECTRON: Mini Mode Widget ───────────────────────── */}
      {isElectron && isMiniMode && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0f172a', display: 'flex', flexDirection: 'column', padding: '0.6rem 0.75rem', WebkitAppRegion: 'drag' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', WebkitAppRegion: 'no-drag' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'white', fontSize: '0.75rem', fontWeight: 800 }}>
              <BarChart2 size={13} style={{ color: '#6366f1' }}/>
              PayTrack
            </div>
            <button onClick={() => window.electronAPI?.toggleMini()} title="Expandir" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '5px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '0.2rem 0.45rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Maximize2 size={11}/> Expandir
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', WebkitAppRegion: 'no-drag' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cobrado</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--mono)', color: '#22c55e' }}>${((estadisticas.montoPagado||0)+(estadisticas.montoFacturado||0)).toLocaleString('en-US',{maximumFractionDigits:0})}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.4rem 0.6rem' }}>
                <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.1rem' }}>PENDIENTES</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f97316' }}>{(estadisticas.cotizado||0)+(estadisticas.notificado||0)}</div>
              </div>
              {metaMensual > 0 && (
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.4rem 0.6rem' }}>
                  <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.1rem' }}>META</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'white' }}>{Math.min(100,Math.round(((estadisticas.montoPagado||0)+(estadisticas.montoFacturado||0))/metaMensual*100))}%</div>
                </div>
              )}
            </div>
            {metaMensual > 0 && (
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#22c55e', borderRadius: '99px', width: `${Math.min(100,((estadisticas.montoPagado||0)+(estadisticas.montoFacturado||0))/metaMensual*100)}%`, transition: 'width 0.5s' }}/>
              </div>
            )}
          </div>
          <div style={{ marginTop: 'auto', fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', WebkitAppRegion: 'no-drag' }}>{session?.user?.nombre||''}</div>
        </div>
      )}

      {/* ── ELECTRON: Custom Titlebar ─────────────────────────── */}
      {isElectron && !isMiniMode && (
        <div style={{ height: '36px', background: '#1e1e2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', WebkitAppRegion: 'drag', flexShrink: 0, zIndex: 9999 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '20px', background: 'linear-gradient(135deg, #6366f1, #7c3aed)', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 800 }}>P</span>
            </div>
            <span style={{ color: '#818cf8', fontSize: '0.78rem', fontWeight: 300 }}>Pay</span><span style={{ color: '#ffffff', fontSize: '0.78rem', fontWeight: 800 }}>Track</span>
          </div>
          {tickerItems.length > 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: tickerVisible ? 1 : 0, transform: tickerVisible ? 'translateY(0)' : 'translateY(-6px)', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                <span style={{ fontSize: '0.75rem' }}>{tickerItems[tickerIndex]?.icon}</span>
                <span style={{ fontSize: '0.72rem', color: tickerItems[tickerIndex]?.color || '#e8e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '500px' }}>
                  {tickerItems[tickerIndex]?.text}
                </span>
                <span style={{ fontSize: '0.65rem', color: '#5a5a7a', marginLeft: '0.3rem' }}>
                  {tickerIndex + 1}/{tickerItems.length}
                </span>
              </div>
            </div>
          )}
          <div id="electron-win-controls" style={{ display: 'flex', gap: '0.3rem', WebkitAppRegion: 'no-drag' }}>
            <button onClick={() => window.electronAPI?.toggleMini()} title="Modo mini" style={{ width: '28px', height: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#7878a0', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}><Minimize2 size={10}/></button>
            <button onClick={() => window.electronAPI?.minimizeWindow()} title="Minimizar" style={{ width: '28px', height: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#7878a0', borderRadius: '4px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>─</button>
            <button onClick={() => window.electronAPI?.maximizeWindow()} title="Maximizar" style={{ width: '28px', height: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#7878a0', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background='none'}>□</button>
            <button onClick={() => window.electronAPI?.closeWindow()} title="Cerrar" style={{ width: '28px', height: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#7878a0', borderRadius: '4px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => { e.currentTarget.style.background='#ef4444'; e.currentTarget.style.color='#fff'; }} onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='#7878a0'; }}>✕</button>
          </div>
        </div>
      )}

      {/* TOPBAR — ESPN style */}
      <div className="topbar" style={{ background:'var(--bg)', borderBottom:'1px solid var(--border)', height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.25rem', position:'sticky', top:0, zIndex:300 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <button className="hamburger-btn" onClick={() => setShowMobileMenu(v => !v)} title="Menú">
            {showMobileMenu ? <X size={20}/> : <Menu size={20}/>}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <div style={{ width:'26px', height:'26px', background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:'7px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <CircleDollarSign size={14} color="#fff" strokeWidth={2}/>
            </div>
            <span style={{ fontWeight:300, fontSize:'0.92rem', color:'#6366f1', letterSpacing:'-0.02em' }}>Pay<span style={{ fontWeight:800, color:'var(--text)' }}>Track</span></span>
          </div>
        </div>

        {/* NAV CENTRAL TIPO PILL */}
        <div style={{ display:'flex', alignItems:'center', gap:'2px', background:'var(--surface-2)', borderRadius:'20px', padding:'3px' }}>
          {[
            { tab:'dashboard', label:'Inicio' },
            ...(tienePermiso('ver_clientes') ? [{ tab:'cartera', label:'Cartera' }] : []),
            { tab:'tickets', label:'Tickets' },
            ...(tienePermiso('ver_creditos') ? [{ tab:'credito', label:'Crédito' }] : []),
            { tab:'agenda', label:'Agenda' },
            { tab:'documentos', label:'Documentos' },
            { tab:'grupos', label:'Grupos' },
          ].map(item => (
            <button key={item.tab} onClick={() => setActiveTab(item.tab)} style={{ padding:'5px 14px', borderRadius:'16px', fontSize:'12px', fontWeight: activeTab === item.tab ? 600 : 400, background: activeTab === item.tab ? 'var(--text)' : 'transparent', color: activeTab === item.tab ? 'var(--bg)' : 'var(--text-muted)', border:'none', cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap' }}>
              {item.label}
            </button>
          ))}
        </div>

        {/* TOPBAR RIGHT */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <div style={{ position:'relative' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.3rem 0.75rem', minWidth:'200px' }}>
              <Search size={13} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
              <input type="text" value={busquedaGlobal} onChange={e => { setBusquedaGlobal(e.target.value); setShowBusquedaGlobal(true); }} onBlur={() => setTimeout(() => setShowBusquedaGlobal(false), 180)} placeholder="Buscar cliente..." style={{ border:'none', background:'transparent', outline:'none', fontSize:'0.82rem', color:'var(--text)', width:'100%' }}/>
              {busquedaGlobal && <button onClick={() => { setBusquedaGlobal(''); setShowBusquedaGlobal(false); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0, lineHeight:1 }}>×</button>}
            </div>
            {showBusquedaGlobal && busquedaGlobal.length > 1 && (() => {
              const term = busquedaGlobal.toLowerCase();
              const resultados = clientes.filter(c => (c.nombre || '').toLowerCase().includes(term) || (c.codigo || '').toLowerCase().includes(term)).slice(0, 6);
              return (
                <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', zIndex:9999, overflow:'hidden' }}>
                  {resultados.length === 0 ? <div style={{ padding:'0.75rem 1rem', fontSize:'0.8rem', color:'var(--text-muted)' }}>Sin resultados</div> : resultados.map(c => (
                    <div key={c.id} onMouseDown={() => { setBusquedaGlobal(''); setShowBusquedaGlobal(false); setActiveTab('cartera'); setTimeout(() => { setSearchTerm(c.nombre || ''); setPaginaActual(1); }, 100); }} style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.55rem 0.9rem', cursor:'pointer', borderBottom:'1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'var(--brand)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.75rem', flexShrink:0 }}>{(c.nombre || '?').charAt(0).toUpperCase()}</div>
                      <div><div style={{ fontWeight:600, fontSize:'0.82rem', color:'var(--text)' }}>{c.nombre}</div>{c.codigo && <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{c.codigo}</div>}</div>
                      <div style={{ marginLeft:'auto', fontSize:'0.7rem', fontWeight:600, color: c.estado === 'Vencido' ? '#ef4444' : 'var(--text-muted)' }}>{c.estado}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div ref={clockRef} style={{ fontSize:'0.75rem', color:'var(--text-muted)', whiteSpace:'nowrap', letterSpacing:'0.02em' }} />
          {/* AVATAR + CERRAR SESIÓN */}
          <div style={{ position:'relative' }}>
            <div onClick={() => setShowTopbarMenu(v => !v)} style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(135deg,#4f46e5,#6366f1)', color:'#fff', fontSize:'12px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
              {(session?.user?.name || currentUser || 'U').charAt(0).toUpperCase()}
            </div>
            {showTopbarMenu && (
              <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:9999, minWidth:'180px', overflow:'hidden' }}>
                <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:'12px', color:'var(--text-muted)' }}>
                  <div style={{ fontWeight:700, color:'var(--text)', fontSize:'13px' }}>{session?.user?.name || currentUser}</div>
                  <div style={{ fontSize:'11px', marginTop:'2px' }}>{session?.user?.rol || 'Usuario'}</div>
                </div>
                <button onClick={() => { setShowTopbarMenu(false); setDarkMode(!darkMode); }} style={{ width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'var(--text)', borderBottom:'1px solid var(--border)' }}>
                  {darkMode ? <Sun size={14}/> : <Moon size={14}/>} {darkMode ? 'Modo claro' : 'Modo oscuro'}
                </button>
                {esAdmin && <button onClick={() => { setShowTopbarMenu(false); cargarUsuariosAdmin(); setActiveTab('usuarios'); }} style={{ width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'var(--text)', borderBottom:'1px solid var(--border)' }}>
                  <Users size={14}/> Usuarios
                </button>}
                {['admin','supervisor_cobro','supervisor_contabilidad'].includes(session?.user?.rol) && <button onClick={() => { setShowTopbarMenu(false); setShowDescargaMesModal(true); }} style={{ width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'#dc2626', borderBottom:'1px solid var(--border)' }}>
                  <Save size={14}/> Cierre de Mes
                </button>}
                {esAdmin && <button onClick={() => { setShowTopbarMenu(false); setShowSettingsPanel(true); }} style={{ width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'var(--text)', borderBottom:'1px solid var(--border)' }}>
                  <Settings size={14}/> Configuración
                </button>}
                <button onClick={() => { setShowTopbarMenu(false); setShowWhatsappStatusModal(true); }} style={{ width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'var(--text)', borderBottom:'1px solid var(--border)' }}>
                  <MessageCircle size={14}/> WhatsApp
                </button>
                <button onClick={() => { setShowTopbarMenu(false); window._manualLogout = true; signOut({ callbackUrl: '/' }); setTimeout(() => { window.location.href = '/'; }, 500); }} style={{ width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'#dc2626', fontWeight:600 }}>
                  <LogOut size={14}/> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="topbar-left" style={{ display:'none' }}>

        </div>
        {/* TOPBAR CENTER — búsqueda global + reloj */}
        <div className="topbar-center" style={{ display:"none" }}>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface-2, rgba(255,255,255,0.06))', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.3rem 0.75rem', minWidth: '260px' }}>
              <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
              <input
                type="text"
                value={busquedaGlobal}
                onChange={e => { setBusquedaGlobal(e.target.value); setShowBusquedaGlobal(true); }}
                onBlur={() => setTimeout(() => setShowBusquedaGlobal(false), 180)}
                placeholder="Buscar cliente..."
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', color: 'var(--text)', width: '100%' }}
              />
              {busquedaGlobal && (
                <button onClick={() => { setBusquedaGlobal(''); setShowBusquedaGlobal(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>×</button>
              )}
            </div>
            {showBusquedaGlobal && busquedaGlobal.length > 1 && (() => {
              const term = busquedaGlobal.toLowerCase();
              const resultados = clientes.filter(c =>
                (c.nombre || '').toLowerCase().includes(term) ||
                (c.codigo || '').toLowerCase().includes(term)
              ).slice(0, 6);
              return (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 9999, overflow: 'hidden' }}>
                  {resultados.length === 0 ? (
                    <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin resultados</div>
                  ) : resultados.map(c => (
                    <div key={c.id} onMouseDown={() => { setBusquedaGlobal(''); setShowBusquedaGlobal(false); setActiveTab('cartera'); setTimeout(() => { setSearchTerm(c.nombre || ''); setPaginaActual(1); }, 100); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.9rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
                        {(c.nombre || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)' }}>{c.nombre}</div>
                        {c.codigo && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.codigo}</div>}
                      </div>
                      <div style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 600, color: c.estado === 'Vencido' ? '#ef4444' : c.estado === 'Por vencer' ? '#f59e0b' : 'var(--text-muted)' }}>
                        {c.estado}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div ref={clockRef} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', letterSpacing: '0.02em', marginLeft: '1rem' }} />
        </div>

        <div className="topbar-right" style={{ display:"none" }}>
          {soloLectura && <span style={{ background: 'rgba(254,249,195,0.15)', color: '#fbbf24', fontSize: '0.67rem', padding: '0.2rem 0.55rem', borderRadius: '5px', fontWeight: 700, marginRight: '0.25rem', border: '1px solid rgba(251,191,36,0.25)' }}>Solo lectura</span>}
          <button className="topbar-icon-btn" onClick={() => setDarkMode(!darkMode)} title="Modo oscuro">
            {darkMode ? <Sun size={16}/> : <Moon size={16}/>}
          </button>
          {esAdmin && (
            <button className="topbar-icon-btn" onClick={abrirAuditLog} title="Auditoría">
              <FileText size={16}/>
            </button>
          )}
          {/* GMAIL — desactivado temporalmente */}
          {false && (
            <div style={{ position: 'relative' }}>
              <button className="topbar-icon-btn" onClick={() => { setShowGmailPanel(v => !v); if (!showGmailPanel) cargarGmail(); }} title="Gmail" style={{ position: 'relative' }}>
                <Mail size={16}/>
                {gmailUnread > 0 && <span style={{ position: 'absolute', top: '2px', right: '2px', minWidth: '16px', height: '16px', background: '#dc2626', borderRadius: '8px', fontSize: '0.6rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{gmailUnread}</span>}
              </button>
              {showGmailPanel && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => { setShowGmailPanel(false); setGmailSelected(null); }} />
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: '420px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 999, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Mail size={16}/> Gmail
                        {gmailUnread > 0 && <span style={{ background: '#dc2626', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '10px' }}>{gmailUnread} nuevos</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {gmailSelected && <button onClick={() => setGmailSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem' }}>← Volver</button>}
                        <button onClick={() => cargarGmail(gmailSearch)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} title="Actualizar"><RefreshCw size={13}/></button>
                      </div>
                    </div>
                    {/* Búsqueda */}
                    {!gmailSelected && (
                      <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface-2)', borderRadius: '8px', padding: '0.4rem 0.7rem', border: '1px solid var(--border)' }}>
                          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
                          <input type="text" value={gmailSearch} onChange={e => setGmailSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && cargarGmail(gmailSearch)} placeholder="Buscar emails..." style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', color: 'var(--text)', width: '100%' }}/>
                          {gmailSearch && <button onClick={() => { setGmailSearch(''); cargarGmail(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>×</button>}
                        </div>
                      </div>
                    )}
                    {/* Lista o detalle */}
                    <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
                      {gmailLoading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }}/></div>
                      ) : gmailSelected ? (
                        <div style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: '0.5rem' }}>{gmailSelected.subject}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>{(gmailSelected.fromName || gmailSelected.from || '?').charAt(0).toUpperCase()}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)' }}>{gmailSelected.fromName || gmailSelected.from}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{gmailSelected.fromEmail}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: '0.75rem', borderRadius: '8px', maxHeight: '260px', overflowY: 'auto' }}>{gmailSelected.body || gmailSelected.snippet}</div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                            <button onClick={() => { setGmailReply(gmailSelected); setGmailReplyBody(''); setShowGmailPanel(false); setGmailSelected(null); }} className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}>
                              <Send size={12}/> Responder
                            </button>
                            {gmailSelected.unread && (
                              <button onClick={() => marcarGmailLeido(gmailSelected.id)} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}>
                                Marcar leído
                              </button>
                            )}
                          </div>
                        </div>
                      ) : gmailEmails.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No hay emails</div>
                      ) : gmailEmails.map(email => (
                        <div key={email.id} onClick={() => { setGmailSelected(email); if (email.unread) marcarGmailLeido(email.id); }}
                          style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', background: email.unread ? 'var(--surface-2)' : 'transparent', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>{(email.fromName || email.from || '?').charAt(0).toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: email.unread ? 700 : 500, fontSize: '0.82rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{email.fromName || email.from}</div>
                                {email.unread && <span style={{ width: '7px', height: '7px', background: '#3b82f6', borderRadius: '50%', flexShrink: 0 }}></span>}
                              </div>
                              <div style={{ fontWeight: email.unread ? 600 : 400, fontSize: '0.78rem', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.snippet}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '0.65rem 1rem', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                      <a href="https://mail.google.com" target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--brand)', fontWeight: 700, textDecoration: 'none' }}>Abrir Gmail completo →</a>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* CAMPANA DE NOTIFICACIONES */}
          <div style={{ position: 'relative' }}>
            <button className="topbar-icon-btn" onClick={() => setShowNotifPanel(v => !v)} title="Notificaciones" style={{ position: 'relative' }}>
              <Bell size={16}/>

              {(estadisticas.vencido > 0 || esDespuesDel15) && (
                <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', display: 'block' }} />
              )}
            </button>
            {showNotifPanel && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowNotifPanel(false)} />
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: '300px', background: 'var(--bg-card, #1e293b)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 999, overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 700, fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)' }}>
                    <MessageCircle size={14} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/> Notificaciones
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
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}><CheckCircle size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Sin clientes vencidos</div>
                  )}
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ background: esDespuesDel15 ? 'rgba(249,115,22,0.2)' : 'rgba(100,116,139,0.2)', borderRadius: '6px', padding: '0.15rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, color: esDespuesDel15 ? '#fb923c' : '#94a3b8' }}>CORTE</span>
                    <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                      {esDespuesDel15 ? <><AlertTriangle size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Ya pasó el día 15 de este mes</> : `Día 15 de cada mes · Faltan ${15 - new Date().getDate()} días`}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* AVATAR USUARIO */}
          <div className="user-menu-container" style={{ position: 'relative' }}>
            <div
              onClick={() => setShowUserMenu(v => !v)}
              style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', border: '2px solid var(--border)', transition: 'transform 0.15s ease' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              title={session?.user?.name || session?.user?.username}
            >
              {(session?.user?.name || session?.user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            {showUserMenu && (
              <div style={{ position: 'absolute', top: '42px', right: 0, background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '200px', zIndex: 9999, overflow: 'hidden' }}>
                <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>{session?.user?.name || session?.user?.username}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{session?.user?.rol}{empresaActual ? ` · ${empresaActual.nombre}` : ''}</div>
                  {appVersion && <div style={{ fontSize: '0.7rem', color: 'var(--text-xlight)', marginTop: '0.15rem' }}>v{appVersion}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }}></div>
                    <span style={{ fontSize: '0.7rem', color: '#22c55e', fontWeight: 600 }}>En línea</span>
                  </div>
                </div>
                <div style={{ padding: '0.4rem' }}>
                  {tienePermiso('acceder_configuracion') && (
                    <button onClick={() => { setSettingsSection('config'); setShowSettingsPanel(true); setShowUserMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '0.83rem', color: 'var(--text)', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <Settings size={14}/> Preferencias
                    </button>
                  )}
                  {/* Actualización — solo en Electron */}
                  {typeof window !== 'undefined' && window.electronAPI?.isElectron && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        if (updateDownloaded) { window.electronAPI.installUpdate(); }
                        else if (downloading) { /* en progreso */ }
                        else if (updateAvailable) { setDownloading(true); window.electronAPI.startDownload(); }
                      }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'none', border: 'none', cursor: updateAvailable ? 'pointer' : 'default', borderRadius: '6px', fontSize: '0.83rem', color: updateDownloaded ? '#22c55e' : updateAvailable ? '#6366f1' : 'var(--text-muted)', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}
                    >
                      <Download size={14}/>
                      {updateDownloaded
                        ? 'Reiniciar y actualizar'
                        : downloading
                          ? `Descargando... ${downloadProgress}%`
                          : updateAvailable
                            ? `Actualizar a v${updateVersion}`
                            : 'App actualizada'}
                      {updateAvailable && !downloading && !updateDownloaded && (
                        <span style={{ marginLeft: 'auto', width: '7px', height: '7px', borderRadius: '50%', background: '#6366f1', flexShrink: 0 }}/>
                      )}
                    </button>
                  )}
                  <button onClick={() => { setShowTopbarMenu(false); window._manualLogout = true; signOut({ callbackUrl: '/' }); setTimeout(() => { window.location.href = '/'; }, 500); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px', fontSize: '0.83rem', color: '#ef4444', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background='#fff1f2'} onMouseLeave={e => e.currentTarget.style.background='none'}>
                    <LogOut size={14}/> Cerrar sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showMobileMenu && <div className="mobile-overlay" onClick={() => setShowMobileMenu(false)} />}
      <div className="main-layout" style={{ display:'block' }}>
        {/* SIDEBAR — oculto */}
        <div className={`sidebar${showMobileMenu ? ' mobile-open' : ''}`} style={{ display:'none' }}>
          {/* Logo — fuera del scroll, siempre visible */}
          <div style={{ padding: '1.1rem 1rem', borderBottom: '1px solid #e0dfd8', display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
            <div style={{ width: '28px', height: '28px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
              <CircleDollarSign size={15} color="#fff" strokeWidth={2}/>
            </div>
            <span style={{ fontWeight: 300, fontSize: '0.95rem', color: '#6366f1', letterSpacing: '-0.02em' }}>Pay<span style={{ fontWeight: 800, color: '#3d3c35' }}>Track</span></span>
          </div>
          {/* Zona scrollable */}
          <div className="sidebar-scroll">
          <div className="sidebar-section">
            <div className="sidebar-label">Gestión</div>
            <div className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><span className="icon"><LayoutGrid size={14}/></span> Inicio</div>
            <div className={`sidebar-item ${activeTab === 'calendario' ? 'active' : ''}`} onClick={() => setActiveTab('calendario')}><span className="icon"><Calendar size={14}/></span> Calendario</div>
            {tienePermiso('ver_clientes') && <div className={`sidebar-item ${activeTab === 'cartera' ? 'active' : ''}`} onClick={() => setActiveTab('cartera')}><span className="icon"><BarChart2 size={14}/></span> Cartera</div>}
            <div className={`sidebar-item ${activeTab === 'tickets' ? 'active' : ''}`} onClick={() => setActiveTab('tickets')}><span className="icon"><ClipboardList size={14}/></span> Tickets</div>
            {tienePermiso('ver_creditos') && <div className={`sidebar-item ${activeTab === 'credito' ? 'active' : ''}`} onClick={() => setActiveTab('credito')}><span className="icon"><CreditCard size={14}/></span> Crédito</div>}
            <div className={`sidebar-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab('agenda')}><span className="icon"><Calendar size={14}/></span> Agenda del Día</div>
            <div className={`sidebar-item ${activeTab === 'documentos' ? 'active' : ''}`} onClick={() => { setActiveTab('documentos'); cargarTodosDocumentos(); }}><span className="icon"><FileText size={14}/></span> Documentos</div>
            {puedeVerTodo && <div className={`sidebar-item ${activeTab === 'carteras' ? 'active' : ''}`} onClick={() => setActiveTab('carteras')}><span className="icon"><Users size={14}/></span> Carteras por Agente</div>}
            {tienePermiso('acceder_delegaciones') && <div className={`sidebar-item ${activeTab === 'delegations' ? 'active' : ''}`} onClick={() => { setActiveTab('delegations'); cargarDelegations(); }} style={{ position: 'relative' }}><span className="icon"><ArrowLeftRight size={14}/></span> Delegations{delegationsPendientes.length > 0 && <span style={{ position: 'absolute', top: '6px', right: '8px', width: '8px', height: '8px', background: '#f97316', borderRadius: '50%' }}></span>}</div>}
            {esContabilidad && tienePermiso('ver_conciliacion') && <div className={`sidebar-item ${activeTab === 'conciliacion' ? 'active' : ''}`} onClick={() => setActiveTab('conciliacion')}><span className="icon"><List size={14}/></span> Conciliación</div>}
            {esContabilidad && <div className={`sidebar-item ${activeTab === 'validar_pagos' ? 'active' : ''}`} onClick={() => { setActiveTab('validar_pagos'); cargarPagosPendientes(); }}><span className="icon"><Check size={14}/></span> Validar Pagos{pagosPendientesCount > 0 && <span style={{ marginLeft:'6px', background:'#f97316', color:'#fff', borderRadius:'10px', padding:'0 6px', fontSize:'0.7rem', fontWeight:700 }}>{pagosPendientesCount}</span>}</div>}
            {tienePermiso('ver_clientes') && (() => { const noGen = datosActuales.clientes.filter(c => c.estado === 'No Generaron' || c.estado === 'Archivado').length; return <div className={`sidebar-item ${activeTab === 'reactivacion' ? 'active' : ''}`} onClick={() => setActiveTab('reactivacion')} style={{ position: 'relative' }}><span className="icon"><Archive size={14}/></span> Reactivación{noGen > 0 && <span style={{ marginLeft:'6px', background:'#64748b', color:'#fff', borderRadius:'10px', padding:'0 6px', fontSize:'0.7rem', fontWeight:700 }}>{noGen}</span>}</div>; })()}
            <div className="sidebar-item" onClick={() => { abrirCargaMasiva(); }}><span className="icon"><Upload size={14}/></span> Carga Masiva PDF</div>
            {['admin', 'supervisor_cobro', 'supervisor_contabilidad'].includes(session?.user?.rol) && <div className="sidebar-item" style={{ color: '#dc2626', fontWeight: 700 }} onClick={() => setShowDescargaMesModal(true)}><span className="icon"><Save size={14}/></span> Cierre de Mes</div>}
            {esAdmin && <div className={`sidebar-item ${activeTab === 'usuarios' ? 'active' : ''}`} onClick={() => { cargarUsuariosAdmin(); setActiveTab('usuarios'); }}><span className="icon"><Users size={14}/></span> Usuarios</div>}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }} onClick={() => setShowExportMenu(v => !v)}>
              <span>Exportar</span>
              <ChevronDown size={10} style={{ transform: showExportMenu ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.2s' }}/>
            </div>
            {showExportMenu && (<>
            <div className="sidebar-item" onClick={exportarTodosExcel}><span className="icon"><Download size={14}/></span> Excel — Todos</div>
            <div className="sidebar-item" onClick={exportarNoGeneraron}><span className="icon"><Download size={14}/></span> No Generaron</div>
            <div className="sidebar-item" onClick={exportarFacturados}><span className="icon"><Download size={14}/></span> Facturados</div>
            {tienePermiso('ver_reportes_pdf') && <div className="sidebar-item" onClick={exportarPDF}><span className="icon"><FileText size={14}/></span> PDF — Cartera</div>}
            {tienePermiso('ver_reportes_pdf') && <div className="sidebar-item" onClick={generarResumenPDF}><span className="icon"><FileText size={14}/></span> Resumen PDF</div>}
            <div className="sidebar-item" onClick={backupJSON}><span className="icon"><Download size={14}/></span> Backup JSON</div>
            <div className="sidebar-item" onClick={() => setShowImportModal(true)}><span className="icon"><Upload size={14}/></span> Importar Excel</div>
            </>)}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Período</div>
            <div style={{ padding: '0 0.65rem' }}>
              <select value={mesVisualizando} onChange={(e) => setMesVisualizando(e.target.value)} style={{ width: '100%', padding: '0.45rem 0.6rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', marginBottom: '0.45rem' }}>
                {obtenerMesesDisponibles().map(mes => <option key={mes} value={mes}>{obtenerNombreMes(mes)}{mes === obtenerMesActual() ? ' (Actual)' : ''}</option>)}
              </select>
              {esModoPasado && (
                <div style={{ padding: '0.35rem 0.6rem', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.18)', borderRadius: '6px', fontSize: '0.73rem', fontWeight: 600, color: 'rgba(249,115,22,0.7)', textAlign: 'center' }}>Solo Lectura</div>
              )}
            </div>
          </div>

          </div>{/* fin sidebar-scroll */}

        </div>

        {/* CONTENT */}
        <div className="content-area" style={{ marginLeft:0, width:'100%' }}>
          <div className="page-header" style={{ flexDirection:'column', alignItems:'stretch', gap:'1rem', padding:'1.25rem 1.5rem', background:'var(--surface)', borderRadius:'14px', border:'1px solid var(--border)', marginBottom:'0.5rem' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h1 style={{ margin:0, fontSize:'1.3rem', fontWeight:700 }}>Bienvenido, {session?.user?.name || currentUser || 'Usuario'}</h1>
                <p style={{ margin:'0.15rem 0 0', fontSize:'0.78rem', color:'var(--text-muted)' }}>{empresaActual?.subtitulo || empresaActual?.descripcion || (esAdmin ? 'Administrador' : rolActual === 'agente_cobro' ? 'Agente de Cobro' : rolActual === 'contabilidad' ? 'Contabilidad' : rolActual === 'supervisor_cobro' ? 'Supervisor de Cobro' : rolActual === 'supervisor_contabilidad' ? 'Supervisor de Contabilidad' : rolActual === 'editor' ? 'Editor' : rolActual === 'viewer' ? 'Visualizador' : 'Gestión de Cartera')} · {new Date().toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'0.75rem' }}>
              <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', marginBottom:'0.3rem' }}>Por Cobrar</div>
                <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#ea580c', fontFamily:'var(--mono)' }}>${((estadisticas.montoCotizado||0) + (estadisticas.montoNotificado||0)).toLocaleString('en-US', { maximumFractionDigits:0 })}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{(estadisticas.cotizado||0) + (estadisticas.notificado||0)} clientes pendientes</div>
              </div>
              <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', marginBottom:'0.3rem' }}>Cobrado este mes</div>
                <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#059669', fontFamily:'var(--mono)' }}>${(estadisticas.montoPagado||0).toLocaleString('en-US', { maximumFractionDigits:0 })}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{estadisticas.pagado||0} clientes pagados</div>
              </div>
              <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.75rem 1rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.3rem' }}>
                  <div style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)' }}>Meta mensual</div>
                  <div style={{ fontSize:'0.7rem', fontWeight:700, color: metaMensual > 0 && (estadisticas.montoPagado||0) >= metaMensual ? '#059669' : 'var(--text-muted)' }}>{metaMensual > 0 ? `${Math.min(100, Math.round(((estadisticas.montoPagado||0) / metaMensual) * 100))}%` : '—'}</div>
                </div>
                <div style={{ fontSize:'1.25rem', fontWeight:800, color:'var(--brand)', fontFamily:'var(--mono)' }}>${(metaMensual||0).toLocaleString('en-US', { maximumFractionDigits:0 })}</div>
                {metaMensual > 0 && (<div style={{ marginTop:'0.5rem' }}><div style={{ height:'4px', borderRadius:'99px', background:'var(--border)', overflow:'hidden' }}><div style={{ height:'100%', borderRadius:'99px', background: (estadisticas.montoPagado||0) >= metaMensual ? '#059669' : 'var(--brand)', width:`${Math.min(100, ((estadisticas.montoPagado||0) / metaMensual) * 100)}%`, transition:'width 0.5s ease' }}></div></div></div>)}
                {!metaMensual && <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>Configura en Preferencias</div>}
              </div>
            </div>

          </div>


          {/* TAB DASHBOARD */}
          <div className={`tab-content ${activeTab === 'dashboard' ? 'active' : ''}`}>

            {/* NOTAS DEL DASHBOARD */}
            <div style={{ marginBottom: '1.25rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <div onClick={() => setShowNotasDashboard(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: showNotasDashboard ? '1px solid #e2e8f0' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem' }}>📝</span>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e2d4a' }}>Notas del equipo</span>
                  {notasDashboard.length > 0 && <span style={{ background: '#6366f1', color: '#fff', borderRadius: '20px', padding: '0.1rem 0.5rem', fontSize: '0.7rem', fontWeight: 700 }}>{notasDashboard.length}</span>}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{showNotasDashboard ? '▲' : '▼'}</span>
              </div>
              {showNotasDashboard && (
                <div style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <input
                      value={notaInput}
                      onChange={e => setNotaInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && agregarNota()}
                      placeholder="Escribe una nota para el equipo..."
                      style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.83rem', outline: 'none' }}
                    />
                    <button onClick={agregarNota} disabled={notaLoading || !notaInput.trim()} style={{ padding: '0.5rem 1rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer', opacity: notaLoading || !notaInput.trim() ? 0.5 : 1 }}>
                      {notaLoading ? '…' : 'Agregar'}
                    </button>
                  </div>
                  {notasDashboard.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', padding: '0.5rem' }}>Sin notas este mes</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
                      {notasDashboard.map(n => (
                        <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.75rem', gap: '0.5rem' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6366f1' }}>{n.nombre || n.usuario} </span>
                            <span style={{ fontSize: '0.82rem', color: '#334155' }}>{n.texto}</span>
                          </div>
                          <button onClick={() => eliminarNota(n.id)} title="Eliminar nota" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.85rem', flexShrink: 0, padding: '0 0.2rem' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.5rem', textAlign: 'right' }}>Las notas se borran automáticamente el 1 de cada mes</div>
                </div>
              )}
            </div>

            {/* ALERTAS PRIORITARIAS */}
            {(estadisticas.vencido > 0 || creditoStats.vencido > 0) && (
              <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1.25rem', flexWrap:'wrap' }}>
                {estadisticas.vencido > 0 && (
                  <div onClick={() => setActiveTab('cartera')} style={{ display:'flex', alignItems:'center', gap:'0.6rem', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'10px', padding:'0.6rem 1rem', cursor:'pointer', flex:1, minWidth:'200px' }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#ef4444', flexShrink:0 }}></div>
                    <div>
                      <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#991b1b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Clientes Vencidos</div>
                      <div style={{ fontSize:'0.82rem', color:'#7f1d1d' }}>{estadisticas.vencido} cliente{estadisticas.vencido !== 1 ? 's' : ''} sin pago — Ver cartera →</div>
                    </div>
                  </div>
                )}
                {creditoStats.vencido > 0 && (
                  <div onClick={() => setActiveTab('credito')} style={{ display:'flex', alignItems:'center', gap:'0.6rem', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'10px', padding:'0.6rem 1rem', cursor:'pointer', flex:1, minWidth:'200px' }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#f97316', flexShrink:0 }}></div>
                    <div>
                      <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#9a3412', textTransform:'uppercase', letterSpacing:'0.05em' }}>Créditos Vencidos</div>
                      <div style={{ fontSize:'0.82rem', color:'#7c2d12' }}>{creditoStats.vencido} crédito{creditoStats.vencido !== 1 ? 's' : ''} vencido{creditoStats.vencido !== 1 ? 's' : ''} — Ver crédito →</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MÉTRICAS PRINCIPALES */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'0.75rem', marginBottom:'1.25rem' }}>
              {[
                { label:'Total Clientes', value: clientes.length, sub: `${estadisticas.cotizado + estadisticas.notificado} pendientes`, color:'#0284c7', tab:'cartera' },
                { label:'Cobrado este mes', value: `$${(estadisticas.montoPagado||0).toLocaleString('en-US',{maximumFractionDigits:0})}`, sub:`${estadisticas.pagado} cliente${estadisticas.pagado!==1?'s':''} pagado${estadisticas.pagado!==1?'s':''}`, color:'#059669', tab:'cartera' },
                { label:'Créditos Activos', value: creditoStats.activo + creditoStats.porVencer, sub:`${creditoStats.vencido} vencido${creditoStats.vencido!==1?'s':''}`, color:'#7c3aed', tab:'credito' },
              ].map((s,i) => (
                <div key={i} onClick={() => setActiveTab(s.tab)} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'1rem 1.25rem', cursor:'pointer', position:'relative', overflow:'hidden', transition:'border-color 0.15s' }}
                  onMouseOver={e => e.currentTarget.style.borderColor='var(--brand)'}
                  onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{ width:'3px', position:'absolute', left:0, top:'15%', bottom:'15%', background:s.color, borderRadius:'0 2px 2px 0' }}></div>
                  <div style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.35rem' }}>{s.label}</div>
                  <div style={{ fontSize:'1.7rem', fontWeight:800, color:'var(--text)', fontFamily:'var(--mono)', lineHeight:1, letterSpacing:'-0.02em' }}>{s.value}</div>
                  <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.3rem' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* ACCESOS RÁPIDOS */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'0.6rem', marginBottom:'1.25rem' }}>
              {[
                { label:'Nueva Cotización', icon:<ClipboardList size={22}/>, action:() => { setActiveTab('cartera'); abrirModal(); } },
                { label:'Ver Agenda', icon:<Clock size={22}/>, action:() => setActiveTab('agenda') },
                { label:'Carga Masiva PDF', icon:<FolderOpen size={22}/>, action:() => { abrirCargaMasiva(); } },
                { label:'Exportar Excel', icon:<BarChart2 size={22}/>, action:exportarTodosExcel },
              ].map((a,i) => (
                <button key={i} onClick={a.action} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.4rem', padding:'0.75rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', cursor:'pointer', color:'var(--text)', fontSize:'0.75rem', fontWeight:600, transition:'all 0.15s' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor='var(--brand)'; e.currentTarget.style.background='var(--brand-bg)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--surface)'; }}>
                  <span style={{ fontSize:'1.3rem' }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>

            {/* PANEL INFERIOR: alertas + recientes */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'1.25rem' }}>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'1rem' }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:'0.75rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#f59e0b' }}></div>
                  Créditos por vencer
                </div>
                {creditosAlerta.length === 0
                  ? <p style={{ color:'var(--text-muted)', fontSize:'0.82rem', margin:0 }}>Sin créditos próximos a vencer.</p>
                  : creditosAlerta.slice(0,5).map(c => (
                    <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.5rem 0', borderBottom:'1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:'0.82rem' }}>{c.cliente}</div>
                        <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>Orden: {c.numeroOrden}</div>
                      </div>
                      <span className={`dias-restantes ${getDiasRestantes(c.fechaVencimiento) <= 3 ? 'critico' : 'advertencia'}`}>{getDiasRestantes(c.fechaVencimiento)}d</span>
                    </div>
                  ))
                }
              </div>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'1rem' }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:'0.75rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--brand)' }}></div>
                  Últimos clientes
                </div>
                {[...clientes].reverse().slice(0,5).map(c => (
                  <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.5rem 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      {(() => { const av = getAvatar(c.nombre); return <div className="avatar avatar-sm" style={{ background:av.color, width:'24px', height:'24px', fontSize:'0.65rem' }}>{av.letra}</div>; })()}
                      <span style={{ fontWeight:600, fontSize:'0.82rem' }}>{c.nombre}</span>
                    </div>
                    <span className={`badge badge-${(c.estado||'').toLowerCase().replace(/ /g,'-')}`}>{c.estado}</span>
                  </div>
                ))}
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
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}><BarChart2 size={14} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Antigüedad de Cartera (Aging Report)</div>
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
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)' }}>Meta de Cobros del Mes</div>
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
                      {pct >= 100 ? '¡Meta alcanzada!' : `Faltan $${(metaMensual - cobrado).toLocaleString('en-US', { maximumFractionDigits: 0 })} para la meta`}
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
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>Comparativa de Cobros (últimos meses)</div>
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
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>Actividad Reciente</div>
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

            {/*  PANEL DE ALERTAS INTELIGENTES  */}
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
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>Alertas Inteligentes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {seguimientoHoy.length > 0 && (
                      <div onClick={() => setActiveTab('agenda')} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 1rem', background:'#fef9c3', border:'1px solid #fde047', borderRadius:'10px', cursor:'pointer' }}>
                        <Clock size={20}/>
                        <div><div style={{ fontWeight:700, fontSize:'0.85rem', color:'#713f12' }}>{seguimientoHoy.length} cliente{seguimientoHoy.length>1?'s':''} con seguimiento pendiente HOY</div><div style={{ fontSize:'0.73rem', color:'#92400e' }}>{seguimientoHoy.slice(0,3).map(c=>c.nombre).join(', ')}{seguimientoHoy.length>3?` +${seguimientoHoy.length-3} más`:''}</div></div>
                        <span style={{ marginLeft:'auto', fontSize:'0.75rem', color:'#92400e', fontWeight:700 }}>Ver →</span>
                      </div>
                    )}
                    {promesaIncumplida.length > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 1rem', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:'10px' }}>
                        <AlertTriangle size={20}/>
                        <div><div style={{ fontWeight:700, fontSize:'0.85rem', color:'#991b1b' }}>{promesaIncumplida.length} promesa{promesaIncumplida.length>1?'s':''} de pago incumplida{promesaIncumplida.length>1?'s':''}</div><div style={{ fontSize:'0.73rem', color:'#b91c1c' }}>{promesaIncumplida.slice(0,3).map(c=>c.nombre).join(', ')}</div></div>
                      </div>
                    )}
                    {sinContacto.length > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 1rem', background:'#f0f9ff', border:'1px solid #7dd3fc', borderRadius:'10px' }}>
                        <Phone size={20}/>
                        <div><div style={{ fontWeight:700, fontSize:'0.85rem', color:'#075985' }}>{sinContacto.length} cliente{sinContacto.length>1?'s':''} sin contacto en más de {recordatoriosDias} días</div><div style={{ fontSize:'0.73rem', color:'#0369a1' }}>{sinContacto.slice(0,3).map(c=>c.nombre).join(', ')}{sinContacto.length>3?` +${sinContacto.length-3} más`:''}</div></div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/*  PROYECCIÓN DE COBROS  */}
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
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>Proyección de Cobros</div>
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
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', marginBottom: '1rem' }}>Accesos rápidos</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                {[
                  { label: 'Nuevo Cliente', icon: <UserPlus size={14}/>, action: () => { setActiveTab('cartera'); abrirModal(); }, primary: true, show: tienePermiso('crear_clientes') },
                  { label: 'Nuevo Crédito', icon: <CreditCard size={14}/>, action: () => setActiveTab('credito'), primary: true, show: tienePermiso('crear_creditos') },
                  { label: 'Agenda del Día', icon: <Calendar size={14}/>, action: () => setActiveTab('agenda'), show: true },
                  { label: 'Carga Masiva PDF', icon: <FileText size={14}/>, action: () => { abrirCargaMasiva(); }, show: tienePermiso('subir_documentos') },
                  { label: 'Plantillas WA', icon: <MessageSquare size={14}/>, action: () => setShowPlantillasModal(true), show: true },
                  { label: 'Importar Excel', icon: <Upload size={14}/>, action: () => setShowImportModal(true), show: tienePermiso('crear_clientes') },
                  { label: 'Exportar PDF', icon: <Download size={14}/>, action: exportarPDF, show: tienePermiso('ver_reportes_pdf') },
                  { label: 'Backup', icon: <Download size={14}/>, action: backupJSON, show: esAdmin },
                ].filter(a => a.show).map((a, i) => (
                  <button key={i} onClick={a.action} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem 0.9rem', background: a.primary ? 'var(--brand)' : 'var(--surface-2)', border: a.primary ? 'none' : '1px solid var(--border)', borderRadius:'9px', color: a.primary ? 'white' : 'var(--text)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s', textAlign:'left' }}
                    onMouseEnter={e => e.currentTarget.style.opacity='0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                    {a.icon}{a.label}
                  </button>
                ))}
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
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--navy)', marginBottom: '1.25rem' }}><Clock size={14} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Vencimientos de Créditos</div>
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

          {/* TAB REACTIVACIÓN */}
          <div className={`tab-content ${activeTab === 'reactivacion' ? 'active' : ''}`}>
            {(() => {
              const myUsername = (session?.user?.username || '').toLowerCase();
              const candidatos = datosActuales.clientes.filter(c => {
                if (!puedeVerTodo && c.creadoPor.toLowerCase() !== myUsername) return false;
                return c.estado === 'No Generaron' || c.estado === 'Archivado';
              }).sort((a, b) => {
                const ma = mesesSinActividad(a) ?? 0;
                const mb = mesesSinActividad(b) ?? 0;
                return mb - ma;
              });
              const noGeneraron = candidatos.filter(c => c.estado === 'No Generaron');
              const archivados  = candidatos.filter(c => c.estado === 'Archivado');
              const reactivarCliente = (cliente) => {
                const a = { ...cliente, estado: 'Cotizado', historial: [...(cliente.historial || []), { fecha: new Date().toISOString(), accion: 'Reactivado desde sección Reactivación', usuario: currentUser || session?.user?.username || 'SISTEMA' }] };
                actualizarCliente(a);
                showToast(`${cliente.nombre} reactivado`, 'success');
              };

              const archivarCliente = (cliente) => {
                const esArchivado = cliente.estado === 'Archivado';
                const nuevoEstado = esArchivado ? 'No Generaron' : 'Archivado';
                const a = { ...cliente, estado: nuevoEstado, historial: [...(cliente.historial || []), { fecha: new Date().toISOString(), accion: esArchivado ? 'Cliente desarchivado' : 'Cliente archivado', usuario: currentUser || session?.user?.username || 'SISTEMA' }] };
                actualizarCliente(a);
                showToast(esArchivado ? `${cliente.nombre} desarchivado` : `${cliente.nombre} archivado`, 'info');
              };

              const lista = vistaReact === 'archivados' ? archivados : noGeneraron;

              return (
                <div style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <h2 style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Archive size={18} style={{ color: '#64748b' }}/> Reactivación de Clientes
                      </h2>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {noGeneraron.length} sin generar · {archivados.length} archivados
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => setVistaReact('no-generaron')} className="btn btn-secondary" style={{ background: vistaReact === 'no-generaron' ? 'var(--navy)' : '', color: vistaReact === 'no-generaron' ? 'white' : '', fontSize: '0.8rem' }}>
                        No Generaron <span style={{ marginLeft: '4px', background: vistaReact === 'no-generaron' ? 'rgba(255,255,255,0.2)' : 'var(--border-2)', borderRadius: '10px', padding: '0 6px', fontSize: '0.72rem', fontWeight: 700 }}>{noGeneraron.length}</span>
                      </button>
                      <button onClick={() => setVistaReact('archivados')} className="btn btn-secondary" style={{ background: vistaReact === 'archivados' ? '#64748b' : '', color: vistaReact === 'archivados' ? 'white' : '', fontSize: '0.8rem' }}>
                        <Archive size={13}/> Archivados <span style={{ marginLeft: '4px', background: vistaReact === 'archivados' ? 'rgba(255,255,255,0.2)' : 'var(--border-2)', borderRadius: '10px', padding: '0 6px', fontSize: '0.72rem', fontWeight: 700 }}>{archivados.length}</span>
                      </button>
                    </div>
                  </div>

                  {lista.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px' }}>
                      <Archive size={40} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}/>
                      <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                        {vistaReact === 'archivados' ? 'No hay clientes archivados' : 'No hay clientes sin generar'}
                      </p>
                    </div>
                  ) : (
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Cliente</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Teléfono</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Sin actividad</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((cliente, idx) => {
                            const meses = mesesSinActividad(cliente);
                            const urgente = meses !== null && meses >= 3;
                            return (
                              <tr key={cliente.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text)' }}>{cliente.nombre}</div>
                                  {cliente.codigoCliente && <div style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 700 }}>#{cliente.codigoCliente}</div>}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--mono)', fontSize: '0.78rem', fontWeight: 700, color: cliente.contacto ? '#3b7dd8' : 'var(--text-muted)' }}>
                                  {cliente.contacto || '—'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                  {meses !== null ? (
                                    <span style={{ fontWeight: 800, fontSize: '0.82rem', color: urgente ? '#dc2626' : '#f97316', background: urgente ? '#fee2e2' : '#fff7ed', border: `1px solid ${urgente ? '#fca5a5' : '#fcd9b4'}`, borderRadius: '20px', padding: '0.2rem 0.65rem' }}>
                                      {meses} {meses === 1 ? 'mes' : 'meses'}
                                    </span>
                                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                    {cliente.contacto && (
                                      <button onClick={() => abrirWhatsappModal(cliente)} title="WhatsApp" style={{ padding: '0.35rem 0.6rem', border: '1.5px solid #e2e8f0', borderRadius: '7px', background: 'none', cursor: 'pointer', color: '#16a34a', display: 'flex', alignItems: 'center' }}>
                                        <MessageCircle size={14}/>
                                      </button>
                                    )}
                                    <button onClick={() => reactivarCliente(cliente)} title="Reactivar como Cotizado" style={{ padding: '0.35rem 0.75rem', border: 'none', borderRadius: '7px', background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                      <PlayCircle size={13}/> Reactivar
                                    </button>
                                    <button onClick={() => archivarCliente(cliente)} title={cliente.estado === 'Archivado' ? 'Desarchivar' : 'Archivar'} style={{ padding: '0.35rem 0.6rem', border: '1.5px solid #e2e8f0', borderRadius: '7px', background: 'none', cursor: 'pointer', color: cliente.estado === 'Archivado' ? '#0369a1' : '#64748b', display: 'flex', alignItems: 'center' }}>
                                      <Archive size={14}/>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
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
                { titulo: 'Seguimiento programado para hoy', color: '#713f12', bg: '#fef9c3', border: '#fde047', lista: seguimientoHoy },
                { titulo: 'Promesas de pago incumplidas', color: '#991b1b', bg: '#fef2f2', border: '#fca5a5', lista: promesaIncumplida },
                { titulo: 'Vencidos sin ninguna gestión', color: '#7c2d12', bg: '#fff7ed', border: '#fed7aa', lista: vencidosSinGestion },
                { titulo: `Sin contacto en más de ${recordatoriosDias} días`, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', lista: sinContactoReciente },
              ];
              return (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
                    <div>
                      <h2 style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--text)' }}><Clock size={16} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Agenda del Día</h2>
                      <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{new Date().toLocaleDateString('es-DO',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
                    </div>
                    <div style={{ display:'flex', gap:'0.5rem' }}>
                      <button className="btn btn-primary" style={{ background:'#7c3aed' }} onClick={() => setShowPlantillasModal(true)}><MessageSquare size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Plantillas WA</button>
                      {clientesSeleccionados.length > 0 && <button className="btn btn-primary" style={{ background:'#25d366' }} onClick={iniciarWaMasivo}><MessageCircle size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>WA Masivo ({clientesSeleccionados.length})</button>}
                    </div>
                  </div>
                  {secciones.every(s => s.lista.length === 0) ? (
                    <div style={{ textAlign:'center', padding:'3rem', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'14px' }}>
                      <div style={{ fontSize:'3rem', marginBottom:'0.75rem' }}><CheckCircle size={48}/></div>
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
                                  <span className={`badge badge-${(c.estado||'').toLowerCase().replace(/ /g,'-')}`}>{c.estado}</span>
                                  {c.monto && <span style={{ fontWeight:700, color:'#059669' }}>RD${parseFloat(c.monto).toLocaleString('en-US')}</span>}
                                  {ug && <span>Última gestión: {new Date(ug.fecha).toLocaleDateString('es-DO')} · {ug.resultado}</span>}
                                  {ug?.proximaFecha && <span style={{ color:sec.color, fontWeight:700 }}>Seguimiento: {new Date(ug.proximaFecha).toLocaleDateString('es-DO')}</span>}
                                </div>
                              </div>
                              <div style={{ display:'flex', gap:'0.35rem', flexShrink:0 }}>
                                <button onClick={() => abrirGestionModal(c)} className="btn btn-secondary" style={{ fontSize:'0.75rem', padding:'0.3rem 0.65rem' }}><Phone size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Gestión</button>
                                {c.contacto && <button onClick={() => abrirWhatsappModal(c)} style={{ padding:'0.3rem 0.65rem', border:'1px solid #86efac', background:'#f0fdf4', borderRadius:'7px', cursor:'pointer', fontSize:'0.8rem' }}><MessageCircle size={13}/></button>}
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
                <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text)' }}><FileText size={16} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Documentos y Cotizaciones</h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Genera, sube y envía documentos a tus clientes por WhatsApp</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem' }} onClick={() => { abrirCargaMasiva(); }}>
                  <FolderOpen size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Carga Masiva
                </button>
                <button style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.4rem 0.85rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', display:'flex', alignItems:'center', gap:'0.3rem' }} onClick={() => { setBusquedaDocsGlobal(''); setVincularSelects({}); setShowBuscadorDocsModal(true); }}>
                  <Search size={12}/> Buscar documento
                </button>
                <button style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.4rem 0.85rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => { setBusquedaDocsGlobal(''); setVincularSelects({}); setShowBuscadorDocsModal(true); }}>
                  {Object.values(cotizaciones).reduce((s, d) => s + d.length, 0)} documentos en total
                </button>
              </div>
            </div>

            {/* Cómo funciona — si no hay documentos */}
            {Object.values(cotizaciones).reduce((s, d) => s + d.length, 0) === 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '2rem', marginBottom: '1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}><ClipboardList size={48}/></div>
                <h3 style={{ fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>¿Cómo funciona?</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', maxWidth: '600px', margin: '1.25rem auto 0' }}>
                  {[
                    { paso: '1', icono: <Pencil size={24}/>, titulo: 'Genera o sube', desc: 'Crea una cotización desde el sistema o sube tu PDF existente' },
                    { paso: '2', icono: <Save size={24}/>, titulo: 'Se guarda', desc: 'El documento queda guardado asociado al cliente automáticamente' },
                    { paso: '3', icono: <Send size={24}/>, titulo: 'Notifica', desc: 'El PDF se descarga y WhatsApp se abre con el mensaje listo' },
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
                        {tienePermiso('subir_documentos') && <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => abrirGenCotModal(cliente)}><Pencil size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Generar Cotización</button>}
                        {tienePermiso('subir_documentos') && <label className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', cursor: 'pointer' }}>
                          <FolderOpen size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Subir PDF
                          <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { subirDocumento(cliente.id, e.target.files[0]); e.target.value = ''; }} />
                        </label>}
                        {docs.length > 0 && cliente.contacto && (
                          <button className="btn btn-success" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => abrirNotifDocModal(cliente)}><Send size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Notificar por WhatsApp</button>
                        )}
                      </div>
                    </div>

                    {/* Documentos del cliente */}
                    {docs.length > 0 && (
                      <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {docs.map(doc => (
                          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.85rem', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '1.1rem' }}>{doc.tipo === 'generado' ? <ClipboardList size={16}/> : <FileText size={16}/>}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nombre}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {doc.tipo === 'generado' ? <><Pencil size={11} style={{verticalAlign:'middle', marginRight:'0.2rem'}}/>Generado</> : <><FolderOpen size={11} style={{verticalAlign:'middle', marginRight:'0.2rem'}}/>Subido</>} · {new Date(doc.fecha).toLocaleDateString('es-DO', { day:'2-digit', month:'short', year:'numeric' })}
                                {doc.monto && <span style={{ color: '#059669', fontWeight: 700, marginLeft: '0.4rem' }}>${parseFloat(doc.monto).toLocaleString('en-US',{maximumFractionDigits:2})}</span>}
                              </div>
                            </div>
                            <button onClick={() => descargarDocumento(doc)} className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}><Download size={13}/></button>
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

            {/* Banner de recordatorio mensual */}
            {recordatorioActivo && activeTab === 'cartera' && (() => {
              const pendientes = clientes.filter(c => c.estado === 'Notificado');
              return (
                <div style={{ background:'linear-gradient(135deg,#f97316,#ea580c)', borderRadius:'12px', padding:'0.9rem 1.25rem', marginBottom:'1rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap', boxShadow:'0 4px 16px rgba(234,88,12,0.3)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                    <Bell size={20} style={{ color:'white', flexShrink:0 }}/>
                    <div>
                      <div style={{ color:'white', fontWeight:700, fontSize:'0.95rem' }}>Recordatorio de cobro — día 13</div>
                      <div style={{ color:'rgba(255,255,255,0.85)', fontSize:'0.8rem' }}>
                        {waMasivoEnviados > 0
                          ? `${waMasivoEnviados} enviado${waMasivoEnviados !== 1 ? 's' : ''} de ${pendientes.length + waMasivoEnviados} clientes`
                          : pendientes.length > 0
                            ? `${pendientes.length} cliente${pendientes.length !== 1 ? 's' : ''} sin confirmar pago`
                            : 'Todos los clientes ya confirmaron pago este mes'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'0.5rem', flexShrink:0 }}>
                    {pendientes.length > 0 && (
                      <button onClick={() => {
                        setClientesSeleccionados(pendientes.map(c => c.id));
                        setShowWaMasivoModal(true);
                        setWaMasivoMensaje(getMsgRecordatorio()); setWaMasivoIndex(0); setWaMasivoActivo(false); setWaMasivoEsRecordatorio(true); setWaMasivoEnviados(0);
                      }} style={{ background:'white', color:'#ea580c', border:'none', borderRadius:'8px', padding:'0.5rem 1rem', fontWeight:700, fontSize:'0.83rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                        <MessageCircle size={13}/> Enviar recordatorio
                      </button>
                    )}
                    {esAdmin && <button onClick={async () => {
                      const hoy = new Date();
                      const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
                      await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clave:'recordatorio_mes_enviado', valor: mes }) });
                      setRecordatorioActivo(false);
                    }} style={{ background:'rgba(255,255,255,0.2)', color:'white', border:'1px solid rgba(255,255,255,0.4)', borderRadius:'8px', padding:'0.5rem 0.75rem', fontSize:'0.8rem', cursor:'pointer' }}>
                      Descartar
                    </button>}
                  </div>
                </div>
              );
            })()}

            <div style={{ display:'flex', gap:'8px', marginBottom:'1.25rem', flexWrap:'wrap' }}>
              {[
                { key: 'cotizado',      label: 'Cotizado',      val: estadisticas.cotizado,    pct: estadisticas.cotizadoPct,    color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
                { key: 'notificado',    label: 'Notificado',    val: estadisticas.notificado,  pct: estadisticas.notificadoPct,  color: '#6366f1', bg: '#eff6ff', border: '#bfdbfe' },
                { key: 'pagado',        label: 'Pagado',        val: estadisticas.pagado,      pct: estadisticas.pagadoPct,      color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                { key: 'facturado',     label: 'Facturado',     val: estadisticas.facturado,   pct: estadisticas.facturadoPct,   color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' },
                { key: 'vencido',       label: 'Vencido',       val: estadisticas.vencido,     pct: estadisticas.vencidoPct,     color: '#dc2626', bg: '#fff1f2', border: '#fecdd3' },
                { key: 'no-generaron',  label: 'No Generaron',  val: estadisticas.noGeneraron, pct: estadisticas.noGeneraronPct, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
                { key: 'suspendido',    label: 'Suspendidos',   val: estadisticas.suspendido,  pct: estadisticas.suspendidoPct,  color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' },
                ...(estadisticas.sinDocumento > 0 ? [{ key: 'sin-documento', label: 'Sin Doc.', val: estadisticas.sinDocumento, pct: estadisticas.total > 0 ? ((estadisticas.sinDocumento / estadisticas.total) * 100).toFixed(0) : 0, color: '#b45309', bg: '#fffbeb', border: '#fde68a' }] : []),
              ].map(s => (
                <div key={s.key} onClick={() => { setFilter(filter === s.key ? 'todos' : s.key); setPaginaActual(1); }}
                  title={filter === s.key ? 'Clic para quitar filtro' : `Filtrar por ${s.label}`}
                  style={{ display:'flex', alignItems:'center', gap:'8px', background: s.bg, border: `1px solid ${filter === s.key ? s.color : s.border}`, borderRadius:'10px', padding:'7px 13px', cursor:'pointer', transition:'all 0.15s', outline: filter === s.key ? `2px solid ${s.color}` : 'none', outlineOffset:'2px' }}>
                  <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: s.color, flexShrink:0 }}></div>
                  <span style={{ fontSize:'12px', color:'#9a998f' }}>{s.label}</span>
                  <span style={{ fontSize:'16px', fontWeight:700, color: s.color, fontFamily:'monospace', lineHeight:1 }}>{s.val}</span>
                  <span style={{ fontSize:'10px', color: s.color }}>{s.pct}%</span>
                  {filter === s.key && <span style={{ fontSize:'10px', fontWeight:700, color: s.color }}>✓</span>}
                </div>
              ))}
            </div>

            {/* GRÁFICAS CARTERA */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', marginBottom: '1.25rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div onClick={() => setGraficasVisibles(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', cursor: 'pointer', userSelect: 'none', borderBottom: graficasVisibles ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <BarChart2 size={15}/> Gráficas de Cartera
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{graficasVisibles ? 'Ocultar' : 'Mostrar'}</span>
                  <ChevronDown size={16} style={{ transform: graficasVisibles ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s' }}/>
                </div>
              </div>
              {graficasVisibles && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1.2rem' }}>
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
              </div>}
            </div>

            <div className="controls">
              <div className="search-box">
                <span className="search-icon"><HelpCircle size={14}/></span>
                <input type="text" placeholder="Buscar por nombre, ID o contacto... (F)" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPaginaActual(1); }} />
              </div>


              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button className="btn btn-secondary" onClick={() => setVistaCards(false)} style={{ background: !vistaCards ? 'var(--navy)' : '', color: !vistaCards ? 'white' : '' }} title="Tabla"><ClipboardList size={14}/></button>
                <button className="btn btn-secondary" onClick={() => setVistaCards(true)} style={{ background: vistaCards ? 'var(--navy)' : '', color: vistaCards ? 'white' : '' }} title="Tarjetas"><FileText size={14}/></button>
                <button className="btn btn-secondary" onClick={() => setModoCompacto(m => !m)} style={{ background: modoCompacto ? 'var(--navy)' : '', color: modoCompacto ? 'white' : '' }} title="Modo compacto"><Ban size={14}/></button>
                <button className="btn btn-secondary" onClick={() => setMostrarArchivados(v => !v)} style={{ background: mostrarArchivados ? '#64748b' : '', color: mostrarArchivados ? 'white' : '', fontSize: '0.75rem', gap: '0.3rem' }} title="Mostrar/ocultar archivados"><Archive size={13}/>{mostrarArchivados ? ' Ocultar archivados' : ' Ver archivados'}</button>
                <button className="btn btn-secondary" onClick={() => setShowBusquedaAvanzada(b => !b)} style={{ background: showBusquedaAvanzada ? 'var(--accent)' : '', color: showBusquedaAvanzada ? 'white' : '', position: 'relative' }} title="Filtros avanzados">
                  <SlidersHorizontal size={14}/>{(filtroMontoMin || filtroMontoMax || filtroEstados.length > 0 || filtroAgente) && <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: '#f97316', borderRadius: '50%' }}></span>}
                </button>
              </div>
              {tienePermiso('crear_clientes') && <button className="btn btn-primary" onClick={() => !esModoPasado && abrirModal()} disabled={esModoPasado} style={{ opacity: esModoPasado ? 0.5 : 1 }}>+ Nuevo Cliente</button>}
            </div>

            {showBusquedaAvanzada && (
              <div className="adv-search-panel">
                <div className="panel-title"><SlidersHorizontal size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Filtros Avanzados {(filtroMontoMin || filtroMontoMax || filtroEstados.length > 0 || filtroAgente) && <button onClick={() => { setFiltroMontoMin(''); setFiltroMontoMax(''); setFiltroEstados([]); setFiltroAgente(''); }} style={{ marginLeft: '0.5rem', padding: '0.1rem 0.5rem', fontSize: '0.68rem', border: '1px solid var(--danger)', borderRadius: '5px', background: '#fef2f2', color: 'var(--danger)', cursor: 'pointer', fontWeight: 700 }}>✕ Limpiar</button>}</div>
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
              {[{val:'prioridad',label:'Prioridad'},{val:'codigo',label:'Código'},{val:'nombre',label:'Nombre'},{val:'monto',label:'Monto'}].map(({val,label}) => (
                <button key={val} className={`btn-sort ${ordenarPor === val ? 'active' : ''} ${ordenarPor === val ? direccionOrden : ''}`} onClick={() => cambiarOrdenamiento(val)}>{label}</button>
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
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent2)', marginBottom: '0.5rem' }}>{tienePermiso('ver_montos') ? '$' + (parseFloat(cliente.monto) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '***'}</div>
                      {tienePermiso('ver_montos') && s.pagado > 0 && <div style={{ fontSize: '0.75rem', color: '#059669' }}>✓ Pagado: ${s.pagado.toLocaleString('en-US', { maximumFractionDigits: 0 })} · Pend: ${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
                        {cliente.contacto && <a href={`https://wa.me/1${cliente.contacto.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="accion-btn" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', border: '1px solid #86efac', color: '#16a34a' }}><MessageCircle size={13}/></a>}
                        {tienePermiso('editar_clientes') && <button className="accion-btn edit" onClick={() => !esModoPasado && abrirModal(cliente)}><Pencil size={13}/></button>}
                        {tienePermiso('eliminar_clientes') && <button className="accion-btn delete" onClick={() => !esModoPasado && eliminarCliente(cliente.id)}><Trash2 size={13}/></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}


            <div className="table-container" style={{ display: vistaCards ? 'none' : 'block', background:'transparent', border:'none', boxShadow:'none' }}>
              <div className="table-wrapper">
                {clientesFiltrados.length === 0 ? (
                  <div className="empty-state"><h3>No se encontraron clientes</h3><p>Intenta ajustar los filtros o agregar un nuevo cliente</p></div>
                ) : (
                  <table className={modoCompacto ? 'compact-mode' : ''}>
                    <thead><tr style={{ background:'transparent' }}>
                      <th style={{ width:'32px', textAlign:'center', padding:'6px 14px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', border:'none' }}><input type="checkbox" onChange={toggleTodos} checked={clientesPaginados.length > 0 && clientesPaginados.every(c => clientesSeleccionados.includes(c.id))} style={{ cursor:'pointer' }} title="Seleccionar todos" /></th>
                      <th style={{ width:'60px', display:'none' }}>ID</th>
                      <th style={{ padding:'6px 8px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center', border:'none' }}># CÓD</th>
                      <th style={{ padding:'6px 14px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'left', border:'none' }}>CLIENTE</th>
                      {puedeVerTodo && <th style={{ padding:'6px 14px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center', border:'none' }}>AGENTE</th>}
                      <th style={{ padding:'6px 14px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center', border:'none' }}>ESTADO</th>
                      <th style={{ padding:'6px 14px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center', border:'none' }}>TELÉFONO</th>
                      <th style={{ padding:'6px 14px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'right', border:'none' }}>MONTO</th>
                      <th style={{ padding:'6px 14px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center', border:'none' }}>PROCESO</th>
                      <th style={{ padding:'6px 14px', fontSize:'10px', fontWeight:600, color:'#9a998f', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:'center', border:'none' }}>ACCIONES</th>
                    </tr></thead>
                    <tbody>
                      {clientesPaginados.map(cliente => {
                        const estaSuspendido = cliente.suspendido === true;
                        return (
                          <tr key={cliente.id} className={`${estaSuspendido ? 'cliente-suspendido' : ''} ${clientesSeleccionados.includes(cliente.id) ? 'row-selected' : ''}`} style={{ background: clientesSeleccionados.includes(cliente.id) ? '#fefce8' : estaSuspendido ? '#fff1f2' : '#fff', border:'1px solid #f0efe9', borderRadius:'10px', marginBottom:'6px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', transition:'all 0.15s' }}>
                            <td style={{ width:'32px', textAlign:'center' }}><input type="checkbox" checked={clientesSeleccionados.includes(cliente.id)} onChange={() => toggleSeleccion(cliente.id)} style={{ cursor:'pointer' }} /></td>
                            <td style={{ display:'none' }}><div className="id-with-led"><span className={`status-led ${estaSuspendido ? 'suspended' : esClienteActivo(cliente) ? 'active' : 'inactive'}`}></span><strong>{cliente.id}</strong></div></td>
                            <td style={{ padding:'10px 8px', fontSize:'12px', color:'#6366f1', fontFamily:'monospace', fontWeight:700, textAlign:'center', borderBottom:'1px solid #f5f4ef' }}>{cliente.codigoCliente || cliente.id}</td>
                            <td style={{ padding:'10px 14px', borderBottom:'1px solid #f5f4ef' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {(() => { const av = getAvatar(cliente.nombre); return <div className="avatar avatar-sm" style={{ background: av.color }}>{av.letra}</div>; })()}
                                <div>
                                  <div style={{ display:'flex', alignItems:'center', gap:'0.25rem', flexWrap:'wrap' }}>
                                  <span onClick={() => { setHistorialPagosCliente(cliente); setShowHistorialPagosModal(true); }} className="nombre-cliente" title="Ver historial de pagos">{cliente.nombre}</span>
                                  {esClienteNuevo(cliente) && <span title="Cliente nuevo este mes" style={{ fontSize:'0.62rem', fontWeight:700, background:'#dcfce7', color:'#15803d', border:'1px solid #86efac', borderRadius:'20px', padding:'0.1rem 0.45rem', verticalAlign:'middle' }}>NUEVO</span>}
                                  {esMorosoRecurrente(cliente) && <span title="Ha sido notificado sin pagar en 2+ meses" style={{ fontSize:'0.62rem', fontWeight:700, background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:'20px', padding:'0.1rem 0.45rem', verticalAlign:'middle' }}>⚠ Moroso</span>}
                                  <button onClick={() => { setTagClienteId(cliente.id); setTagInput(''); setShowTagModal(true); }} style={{ background:'none', border:'none', cursor:'pointer', opacity:0.35, padding:'0 0.15rem', display:'flex', alignItems:'center' }} title="Agregar etiqueta"><Tag size={12}/></button>
                                  </div>
                                  {(tags[cliente.id] || []).length > 0 && (
                                    <div className="tags-wrap">
                                      {(tags[cliente.id] || []).map(tag => (
                                        <span key={tag} className={`tag-chip ${TAG_CLASSES[tag] || 'default'}`} onClick={() => eliminarTag(cliente.id, tag)} title="Clic para quitar">{tag} <span className="tag-x">×</span></span>
                                      ))}
                                    </div>
                                  )}
                                  {cliente.nota && (
                                    <div onClick={() => abrirNotaModal(cliente)} title={cliente.nota} className="instancia-badge" style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', marginTop:'0.2rem', cursor:'pointer', background:'#fef9c3', border:'1px solid #fde047', borderRadius:'5px', padding:'0.1rem 0.45rem', maxWidth:'220px', opacity:0, transition:'opacity 0.2s ease' }}>
                                      <StickyNote size={11} style={{ color:'#a16207', flexShrink:0 }}/>
                                      <span style={{ fontSize:'0.68rem', fontWeight:600, color:'#92400e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cliente.nota.length > 35 ? cliente.nota.slice(0, 35) + '…' : cliente.nota}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            {puedeVerTodo && <td>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'var(--surface2)', padding: '0.15rem 0.5rem', borderRadius: '20px', color: 'var(--text-muted)' }}>{cliente.creadoPor || '—'}</span>
                              {cliente.assignedTo && cliente.assignedTo !== cliente.creadoPor && (
                                <div style={{ fontSize: '0.67rem', marginTop: '0.2rem', color: '#f97316', fontWeight: 700 }}>→ {cliente.assignedTo}</div>
                              )}
                            </td>}

                            <td style={{ width:'130px', textAlign:'center' }}><span className={`badge badge-${estadoActivoCliente(cliente).toLowerCase().replace(/ /g, '-')}`}>{estadoActivoCliente(cliente)}</span></td>

                            <td style={{ width:'140px', textAlign:'center', fontSize:'0.78rem', letterSpacing:'-0.3px', whiteSpace:'nowrap' }}>
                              {editingContactoId === cliente.id ? (
                                <input type="tel" value={tempContacto} onChange={e => setTempContacto(e.target.value)} onBlur={() => guardarContactoInline(cliente.id)} onKeyDown={e => { if (e.key === 'Enter') guardarContactoInline(cliente.id); else if (e.key === 'Escape') cancelarEdicionContacto(); }} autoFocus style={{ width: '110px', padding: '0.25rem 0.4rem', border: '2px solid var(--brand)', borderRadius: '6px', fontSize: '0.74rem', fontFamily: 'var(--mono)', fontWeight: 700 }} />
                              ) : (
                                <span onDoubleClick={() => !esModoPasado && (setEditingContactoId(cliente.id), setTempContacto(cliente.contacto || ''))} title={esModoPasado ? '' : 'Doble clic para editar'} style={{ cursor: esModoPasado ? 'default' : 'text', fontFamily: 'var(--mono)', fontWeight: 700, color: cliente.contacto ? '#3b7dd8' : 'var(--text-muted)' }}>
                                  {formatTelefono(cliente.contacto)}
                                </span>
                              )}
                            </td>

                            <td style={{ width:'90px', textAlign:'center' }}>
                              {!tienePermiso('ver_montos') ? (
                                <span style={{ color: 'var(--text-muted)', letterSpacing: '0.1em', fontWeight: 700 }}>***</span>
                              ) : editingMontoId === cliente.id ? (
                                <input type="number" value={tempMonto} onChange={(e) => setTempMonto(e.target.value)} onBlur={() => guardarMontoInline(cliente.id)} onKeyDown={(e) => { if (e.key === 'Enter') guardarMontoInline(cliente.id); else if (e.key === 'Escape') cancelarEdicionMonto(); }} autoFocus step="0.01" style={{ width: '90px', padding: '0.35rem 0.5rem', border: '2px solid #0ea5e9', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700 }} />
                              ) : (
                                <div>
                                  <span onDoubleClick={() => !esModoPasado && iniciarEdicionMonto(cliente)} style={{ cursor: esModoPasado ? 'default' : 'text', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text)', fontFamily: 'var(--mono)' }} title={esModoPasado ? '' : 'Doble clic para editar'}>
                                    {'$' + (parseFloat(cliente.monto) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                  </span>
                                  {cliente.pagosRealizados && cliente.pagosRealizados.length > 0 && (() => { const s = calcularSaldoCliente(cliente); return <div style={{ fontSize: '0.68rem', marginTop: '0.15rem' }}><span style={{ color: '#059669', fontWeight: 700 }}>+${s.pagado.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>{s.pendiente > 0 && <span style={{ color: '#ea580c', fontWeight: 700 }}> ${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })} pend.</span>}</div>; })()}
                                </div>
                              )}
                            </td>

                            <td style={{ width:'160px', textAlign:'center' }}>
                              <div className="proceso-icons">
                                <button className={`proceso-icon cotizado ${cliente.fechaCotizacion ? 'done' : ''}`} disabled={esModoPasado} title={cliente.fechaCotizacion ? 'Cotizado' : 'Marcar Cotizado'} onClick={() => { if (esModoPasado) return; const a = { ...cliente }; if (!a.fechaCotizacion) { a.fechaCotizacion = new Date().toISOString().split('T')[0]; a.estado = 'Cotizado'; } else { a.fechaCotizacion = ''; a.fechaNotificacion = ''; a.fechaPago = ''; a.fechaFacturacion = ''; a.pagosRealizados = []; a.estado = 'No Generaron'; } a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.fechaCotizacion ? 'Marco Cotizado' : 'Desmarco Cotizado', usuario: currentUser || session?.user?.username || 'Sistema' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, a.estado); }}><ClipboardList size={13}/></button>
                                <button className={`proceso-icon notificado ${cliente.fechaNotificacion ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaCotizacion} style={{ opacity: !cliente.fechaCotizacion ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaCotizacion) return; if (!cliente.fechaNotificacion) { abrirWhatsappModal(cliente); } else { const a = { ...cliente, fechaNotificacion: '', fechaPago: '', fechaFacturacion: '', pagosRealizados: [], estado: 'Cotizado' }; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: 'Desmarco Notificado', usuario: currentUser || session?.user?.username || 'Sistema' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, 'Cotizado'); } }}><Mail size={13}/></button>
                                {tienePermiso('registrar_pagos') && <button className={`proceso-icon pagado ${cliente.fechaPago ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaNotificacion} style={{ opacity: !cliente.fechaNotificacion ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaNotificacion) return; const a = { ...cliente }; if (!a.fechaPago) { a.fechaPago = new Date().toISOString().split('T')[0]; a.estado = 'Pagado'; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: 'Marco Pagado', usuario: currentUser || session?.user?.username || 'Sistema' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, 'Pagado'); return; } a.fechaPago = ''; a.fechaFacturacion = ''; a.pagosRealizados = []; a.estado = 'Notificado'; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: 'Desmarco Pagado', usuario: currentUser || session?.user?.username || 'Sistema' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, a.estado); }}><DollarSign size={13}/></button>}
                                <button className={`proceso-icon facturado ${cliente.fechaFacturacion ? 'done' : ''}`} disabled={esModoPasado || !cliente.fechaPago} style={{ opacity: !cliente.fechaPago ? 0.3 : 1 }} onClick={() => { if (esModoPasado || !cliente.fechaPago) return; const a = { ...cliente }; if (!a.fechaFacturacion) { a.fechaFacturacion = new Date().toISOString().split('T')[0]; a.estado = 'Facturado'; } else { a.fechaFacturacion = ''; a.estado = 'Pagado'; } a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.fechaFacturacion ? 'Marco Facturado' : 'Desmarco Facturado', usuario: currentUser || session?.user?.username || 'Sistema' }]; actualizarCliente(a); sincronizarEstadoCotizacion(cliente.id, a.estado); }}><FileText size={13}/></button>
                              </div>
                            </td>

                            <td style={{ width:'100px', textAlign:'center', position: 'relative' }}>
                              <div style={{ position: 'relative', display: 'inline-block' }}>
                                <button
                                  onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const spaceBelow = window.innerHeight - rect.bottom; setMenuAbiertoDir(spaceBelow < 240 ? 'up' : 'down'); setMenuAbierto(prev => prev === cliente.id ? null : cliente.id); }}
                                  title="Opciones"
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.4rem 0.55rem', borderRadius: '7px', border: '1.5px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', color: '#1e2d4a' }}>
                                  <MoreVertical size={15}/>
                                </button>
                                {menuAbierto === cliente.id && (
                                  <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 9999, minWidth: '200px', overflow: 'hidden' }}>
                                    {cliente.contacto && (
                                      <button onClick={() => { abrirWhatsappModal(cliente); setMenuAbierto(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#16a34a', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                        <Phone size={15}/>
                                        WhatsApp
                                      </button>
                                    )}
                                    {tienePermiso('editar_clientes') && (
                                      <button onClick={() => { !esModoPasado && abrirModal(cliente); setMenuAbierto(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#1e2d4a', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                        <Edit2 size={15}/>
                                        Editar
                                      </button>
                                    )}
                                    <button onClick={() => { abrirNotaModal(cliente); setMenuAbierto(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#1e2d4a', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                      <StickyNote size={15}/>
                                      {cliente.nota ? 'Ver nota' : 'Agregar nota'}
                                    </button>
                                    {tienePermiso('ver_documentos') && (
                                      <button onClick={() => { abrirDocsModal(cliente); setMenuAbierto(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#7c3aed', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                        <FolderOpen size={15}/>
                                        Documentos {(cotizaciones[cliente.id]||[]).length > 0 && `(${(cotizaciones[cliente.id]||[]).length})`}
                                      </button>
                                    )}
                                    <button onClick={() => { abrirGestionModal(cliente); setMenuAbierto(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#1e2d4a', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                      <BookOpen size={15}/>
                                      Gestión / Bitácora {(gestiones[cliente.id]||[]).length > 0 && `(${(gestiones[cliente.id]||[]).length})`}
                                    </button>
                                    {tienePermiso('ver_reportes_pdf') && (
                                      <button onClick={() => { generarEstadoCuentaPDF(cliente); setMenuAbierto(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#0369a1', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                        <FileSearch size={15}/>
                                        Estado de Cuenta PDF
                                      </button>
                                    )}
                                    {!esModoPasado && (estadoActivoCliente(cliente) !== 'Pagado' && estadoActivoCliente(cliente) !== 'Facturado') && (
                                      <button onClick={() => { const a = { ...cliente }; a.suspendido = !a.suspendido; a.fechaSuspension = a.suspendido ? new Date().toISOString().split('T')[0] : ''; a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), accion: a.suspendido ? 'Cliente SUSPENDIDO' : 'Suspensión removida', usuario: currentUser || 'SISTEMA' }]; actualizarCliente(a); setMenuAbierto(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: cliente.suspendido ? '#16a34a' : '#f97316', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                        {cliente.suspendido ? (
                                          <><PlayCircle size={15}/> Reactivar cliente</>
                                        ) : (
                                          <><PauseCircle size={15}/> Suspender cliente</>
                                        )}
                                      </button>
                                    )}
                                    {!esModoPasado && (estadoActivoCliente(cliente) === 'No Generaron' || estadoActivoCliente(cliente) === 'Archivado') && (
                                      <button onClick={() => {
                                        const esArchivado = cliente.estado === 'Archivado';
                                        const nuevoEstado = esArchivado ? 'No Generaron' : 'Archivado';
                                        const a = { ...cliente, estado: nuevoEstado, historial: [...(cliente.historial || []), { fecha: new Date().toISOString(), accion: esArchivado ? 'Cliente desarchivado' : 'Cliente archivado', usuario: currentUser || 'SISTEMA' }] };
                                        actualizarCliente(a); setMenuAbierto(null);
                                      }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: cliente.estado === 'Archivado' ? '#0369a1' : '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                                        <Archive size={15}/>
                                        {cliente.estado === 'Archivado' ? 'Desarchivar' : 'Archivar'}
                                      </button>
                                    )}
                                    {tienePermiso('eliminar_clientes') && (
                                      <button onClick={() => { !esModoPasado && eliminarCliente(cliente.id); setMenuAbierto(null); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 }}>
                                        <Trash2 size={15}/>
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                )}
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

            {/*  BARRA WHATSAPP MASIVO  */}
            {clientesSeleccionados.length > 0 && (
              <div style={{ position:'sticky', bottom:'1rem', left:0, right:0, zIndex:200, background:'#1e2d4a', borderRadius:'14px', padding:'0.85rem 1.25rem', display:'flex', alignItems:'center', gap:'1rem', boxShadow:'0 8px 30px rgba(0,0,0,0.25)', flexWrap:'wrap' }}>
                <div style={{ color:'white', fontWeight:700, fontSize:'0.88rem' }}>
                  <CheckCircle size={14} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>{clientesSeleccionados.length} cliente{clientesSeleccionados.length>1?'s':''} seleccionado{clientesSeleccionados.length>1?'s':''}
                </div>
                <button onClick={iniciarWaMasivo} style={{ background:'#25d366', color:'white', border:'none', borderRadius:'9px', padding:'0.5rem 1.1rem', fontWeight:700, fontSize:'0.85rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                  <MessageCircle size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>WhatsApp Masivo
                </button>
                <button onClick={() => { const ids = clientesSeleccionados; ids.forEach(id => { const c = clientes.find(x=>x.id===id); if(c) abrirGestionModal(c); }); }} style={{ background:'#f59e0b', color:'white', border:'none', borderRadius:'9px', padding:'0.5rem 1.1rem', fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>
                  <Phone size={13} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Registrar Gestión
                </button>
                <button onClick={() => setClientesSeleccionados([])} style={{ marginLeft:'auto', background:'transparent', color:'#94a3b8', border:'1px solid #334155', borderRadius:'9px', padding:'0.45rem 0.9rem', fontSize:'0.82rem', cursor:'pointer' }}>
                  Cancelar selección
                </button>
              </div>
            )}
          </div>

          {/* TAB CRÉDITO */}
          <div className={`tab-content ${activeTab === 'tickets' ? 'active' : ''}`}>
            <TabTickets currentUser={currentUser} session={session} empresaActual={empresaActual} clientes={clientes} showToast={showToast} />
          </div>

          <div className={`tab-content ${activeTab === 'grupos' ? 'active' : ''}`}>
            <TabGrupos clientes={clientes} session={session} currentUser={currentUser} empresaActual={empresaActual} showToast={showToast} />
          </div>

          <div className={`tab-content ${activeTab === 'credito' ? 'active' : ''}`}>
            {creditosVencidos.length > 0 && <div className="alert-box danger"><h3><AlertTriangle size={14} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Créditos Vencidos ({creditosVencidos.length})</h3>{creditosVencidos.map(credito => <div key={credito.id} className="alert-item"><div><strong>{credito.cliente}</strong> - Orden: {credito.numeroOrden}<div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Vencido: {new Date(credito.fechaVencimiento).toLocaleDateString('es-DO')}</div></div><span className="dias-restantes critico">{Math.abs(getDiasRestantes(credito.fechaVencimiento))} días vencido</span></div>)}</div>}
            {creditosAlerta.length > 0 && <div className="alert-box"><h3><Clock size={14} style={{verticalAlign:'middle', marginRight:'0.3rem'}}/>Créditos por Vencer ({creditosAlerta.length})</h3>{creditosAlerta.map(credito => { const dias = getDiasRestantes(credito.fechaVencimiento); return <div key={credito.id} className="alert-item"><div><strong>{credito.cliente}</strong> - Orden: {credito.numeroOrden}<div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Vence: {new Date(credito.fechaVencimiento).toLocaleDateString('es-DO')}</div></div><span className={`dias-restantes ${dias <= 3 ? 'critico' : 'advertencia'}`}>{dias} {dias === 1 ? 'día' : 'días'}</span></div>; })}</div>}

            <div className="dashboard">
              <div className="stat-card activo"><div className="stat-label">Activos</div><div className="stat-value">{creditoStats.activo}</div><div className="stat-percentage">{creditoStats.activoPct}%</div></div>
              <div className="stat-card por-vencer"><div className="stat-label">Por Vencer</div><div className="stat-value">{creditoStats.porVencer}</div><div className="stat-percentage">{creditoStats.porVencerPct}%</div></div>
              <div className="stat-card credito-vencido"><div className="stat-label">Vencidos</div><div className="stat-value">{creditoStats.vencido}</div><div className="stat-percentage">{creditoStats.vencidoPct}%</div></div>
              <div className="stat-card credito-pagado"><div className="stat-label">Pagados</div><div className="stat-value">{creditoStats.pagado}</div><div className="stat-percentage">{creditoStats.pagadoPct}%</div></div>
              <div className="stat-card activo"><div className="stat-label">Monto Total Activo</div><div className="stat-value" style={{ fontSize: '1.8rem' }}>${creditoStats.totalMonto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
              <div className="stat-card credito-pagado"><div className="stat-label">Monto Total Pagado</div><div className="stat-value" style={{ fontSize: '1.8rem' }}>${creditoStats.montoPagado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
            </div>

            <div className="controls">
              <div className="search-box"><span className="search-icon"><SlidersHorizontal size={13}/></span><input type="text" placeholder="Buscar crédito..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
              <button className="btn btn-success" onClick={exportarCreditosExcel}><BarChart2 size={13}/> Exportar a Excel</button>
              {tienePermiso('ver_reportes_pdf') && <button className="btn btn-secondary" onClick={exportarCreditosPDF}><FileText size={13}/> Exportar PDF</button>}
              {tienePermiso('crear_creditos') && <button className="btn btn-primary" onClick={() => abrirCreditoModal()}><Plus size={13}/> Nuevo Crédito</button>}
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
                              <button className={`proceso-icon cotizado ${credito.fechaCotizacion ? 'done' : ''}`} onClick={() => { const a = { ...credito }; if (!a.fechaCotizacion) a.fechaCotizacion = new Date().toISOString().split('T')[0]; else { a.fechaCotizacion = ''; a.fechaNotificacionC = ''; a.fechaPagoC = ''; a.fechaFacturacionC = ''; } actualizarCredito(a); }}><ClipboardList size={13}/></button>
                              <button className={`proceso-icon notificado ${credito.fechaNotificacionC ? 'done' : ''}`} disabled={!credito.fechaCotizacion} style={{ opacity: !credito.fechaCotizacion ? 0.3 : 1 }} onClick={() => { if (!credito.fechaCotizacion) return; const a = { ...credito }; if (!a.fechaNotificacionC) a.fechaNotificacionC = new Date().toISOString().split('T')[0]; else { a.fechaNotificacionC = ''; a.fechaPagoC = ''; a.fechaFacturacionC = ''; } actualizarCredito(a); }}><Mail size={13}/></button>
                              <button className={`proceso-icon pagado ${credito.fechaPagoC ? 'done' : ''}`} disabled={!credito.fechaNotificacionC} style={{ opacity: !credito.fechaNotificacionC ? 0.3 : 1 }} onClick={() => { if (!credito.fechaNotificacionC) return; if (!credito.fechaPagoC) { abrirPagoCreditoModal(credito); return; } const a = { ...credito }; a.fechaPagoC = ''; a.fechaFacturacionC = ''; a.abonos = []; a.estado = 'Activo'; actualizarCredito(a); }}><DollarSign size={13}/></button>
                              <button className={`proceso-icon facturado ${credito.fechaFacturacionC ? 'done' : ''}`} disabled={!credito.fechaPagoC} style={{ opacity: !credito.fechaPagoC ? 0.3 : 1 }} onClick={() => { if (!credito.fechaPagoC) return; const a = { ...credito }; if (!a.fechaFacturacionC) a.fechaFacturacionC = new Date().toISOString().split('T')[0]; else a.fechaFacturacionC = ''; actualizarCredito(a); }}><DollarSign size={13}/></button>
                            </div>
                          </td>
                          <td>{new Date(credito.fechaInicio).toLocaleDateString('es-DO')}</td>
                          <td>{credito.plazoMeses} {credito.plazoMeses === '1' ? 'mes' : 'meses'}</td>
                          <td>{new Date(credito.fechaVencimiento).toLocaleDateString('es-DO')}</td>
                          <td>{credito.estado !== 'Pagado' && <span className={`dias-restantes ${diasRestantes < 0 ? 'critico' : diasRestantes <= 3 ? 'critico' : diasRestantes <= 7 ? 'advertencia' : ''}`}>{diasRestantes < 0 ? `${Math.abs(diasRestantes)} días vencido` : `${diasRestantes} días`}</span>}</td>
                          <td><span className={`badge badge-${(credito.estado||'').toLowerCase().replace(/ /g, '-')}`}>{credito.estado}</span></td>
                          <td>
                            <div className="action-btns">
                              {credito.estado !== 'Pagado' && <button className="btn-icon" onClick={() => { const a = { ...credito, estado: 'Pagado', historial: [...(credito.historial || []), { fecha: new Date().toISOString(), accion: 'Marcado como Pagado' }] }; actualizarCredito(a); }} title="Marcar Pagado"><CheckCircle size={13}/></button>}
                              <button className="btn-icon" onClick={() => abrirCreditoModal(credito)} title="Editar"><Pencil size={13}/></button>
                              <button className="btn-icon" onClick={() => eliminarCredito(credito.id)} title="Eliminar"><Trash2 size={13}/></button>
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

          {/* TAB VALIDAR PAGOS */}
          {esContabilidad && <div className={`tab-content ${activeTab === 'validar_pagos' ? 'active' : ''}`}>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text)', display:'flex', alignItems:'center', gap:'0.4rem' }}><CheckCircle size={18}/> Validar Pagos</div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>{pagosPendientes.length} pago(s) pendiente(s) de validación</div>
                </div>
                <button onClick={cargarPagosPendientes} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><RefreshCw size={13}/> Actualizar</button>
              </div>
              {pagosPendientes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                  <CheckCircle size={48} style={{ color:'#059669', marginBottom: '1rem' }}/>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>No hay pagos pendientes</div>
                  <div style={{ fontSize: '0.85rem' }}>Todos los pagos han sido validados</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#1e2d4a', color: '#fff' }}>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'left' }}>Cliente</th>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'left' }}>Banco</th>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'left' }}>Referencia</th>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'left' }}>Fecha</th>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'right' }}>Monto</th>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>Registrado por</th>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagosPendientes.map((pago, i) => (
                        <tr key={pago.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.7rem 1rem', fontWeight: 600, color: '#1e2d4a' }}>{pago.cliente_nombre || '-'}</td>
                          <td style={{ padding: '0.7rem 1rem', color: '#64748b' }}>{pago.banco || '-'}</td>
                          <td style={{ padding: '0.7rem 1rem', color: '#64748b' }}>{pago.referencia || '-'}</td>
                          <td style={{ padding: '0.7rem 1rem', color: '#64748b' }}>{pago.tipo_negocio || '-'}</td>
                          <td style={{ padding: '0.7rem 1rem', color: '#64748b' }}>{pago.fecha_pago || '-'}</td>
                          <td style={{ padding: '0.7rem 1rem', textAlign: 'right', fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>${parseFloat(pago.monto).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.7rem 1rem', textAlign: 'center', color: '#64748b' }}>{pago.creado_por || '-'}</td>
                          <td style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>
                            {pagoRechazandoId === pago.id ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '180px' }}>
                                <input value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Motivo de rechazo..." style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }} />
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button onClick={() => validarPago(pago.id, 'rechazar', motivoRechazo)} style={{ flex: 1, padding: '0.3rem', borderRadius: '6px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>Confirmar</button>
                                  <button onClick={() => { setPagoRechazandoId(null); setMotivoRechazo(''); }} style={{ flex: 1, padding: '0.3rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '0.78rem' }}>Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                <button onClick={() => validarPago(pago.id, 'aprobar')} style={{ padding: '0.35rem 0.8rem', borderRadius: '6px', border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><CheckCircle size={13}/> Aprobar</button>
                                <button onClick={() => setPagoRechazandoId(pago.id)} style={{ padding: '0.35rem 0.8rem', borderRadius: '6px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><XCircle size={13}/> Rechazar</button>
                                {esAdmin && <button onClick={async () => { if (!confirm('¿Eliminar este pago?')) return; await fetch(`/api/pagos?id=${pago.id}`, { method: 'DELETE' }); cargarPagosPendientes(); showToast('Pago eliminado', 'success'); }} style={{ padding: '0.35rem 0.8rem', borderRadius: '6px', border: 'none', background: '#64748b', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}><Trash2 size={13}/></button>}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>}

          {/* TAB CONCILIACION */}
          {esContabilidad && <div className={`tab-content ${activeTab === 'conciliacion' ? 'active' : ''}`}>
            <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

              {/* Header */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'14px', padding:'1.25rem 1.5rem' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:'1.05rem', color:'var(--text)' }}>Conciliación Bancaria</div>
                    <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>Compara los movimientos del banco contra los pagos registrados en el sistema</div>
                  </div>
                  <div style={{ display:'flex', gap:'0.5rem' }}>
                  {bancoMovimientos.length > 0 && (
                    <button onClick={() => {
                      const conciliacion = {
                        id: Date.now(),
                        fecha: new Date().toLocaleDateString('es-DO'),
                        archivo: bancoArchivoNombre,
                        total: bancoMovimientos.length,
                        conciliados: bancoMovimientos.filter(m => m.conciliado).length,
                        pendientes: bancoMovimientos.filter(m => !m.conciliado).length,
                        movimientos: bancoMovimientos,
                        usuario: currentUser || session?.user?.name || 'Usuario',
                      };
                      const nuevo = [conciliacion, ...historialConciliaciones].slice(0, 20);
                      setHistorialConciliaciones(nuevo);
                      fetch('/api/historial-conciliaciones', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mes_key: new Date().toISOString().slice(0,7), datos: conciliacion }) }).catch(()=>{});
                      showToast('Conciliación guardada en historial', 'success');
                    }} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem 1rem', background:'#059669', color:'white', borderRadius:'9px', fontSize:'0.84rem', fontWeight:600, cursor:'pointer', border:'none' }}>
                      <Save size={13}/> Guardar Conciliación
                    </button>
                  )}
                  <label style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.6rem 1rem', background:'var(--brand)', color:'white', borderRadius:'9px', fontSize:'0.84rem', fontWeight:600, cursor:'pointer' }}>
                    <Upload size={14}/>
                    Subir Excel del Banco
                    <input type="file" accept=".xlsx,.csv" style={{ display:'none' }} onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          // Parsear xlsx en el browser usando SheetJS
                          const data = new Uint8Array(ev.target.result);
                          // Guardamos el archivo para procesarlo
                          setBancoArchivoNombre(file.name);
                          // Leer con SheetJS (cargado via CDN en el layout)
                          if (typeof XLSX !== 'undefined') {
                            const wb = XLSX.read(data, { type: 'array', cellDates: false });
                            const ws = wb.Sheets[wb.SheetNames[0]];
                            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
                            // Detectar fila de encabezado (buscar "Fecha")
                            let headerRow = -1;
                            for (let i = 0; i < rows.length; i++) {
                              if (rows[i].some(c => String(c||'').toLowerCase().includes('fecha'))) {
                                headerRow = i; break;
                              }
                            }
                            if (headerRow === -1) { showToast('No se pudo detectar el formato del banco', 'error'); return; }
                            const headers = rows[headerRow];
                            const fechaIdx = headers.findIndex(h => String(h||'').toLowerCase().includes('fecha'));
                            const refIdx = headers.findIndex(h => String(h||'').toLowerCase().includes('referencia') || String(h||'').toLowerCase().includes('ref'));
                            const descIdx = headers.findIndex(h => String(h||'').toLowerCase().includes('descripci'));
                            const debitoIdx = headers.findIndex(h => String(h||'').toLowerCase().includes('d\u00e9bito') || String(h||'').toLowerCase().includes('debito'));
                            const creditoIdx = headers.findIndex(h => String(h||'').toLowerCase().includes('cr\u00e9dito') || String(h||'').toLowerCase().includes('credito'));
                            const movimientos = [];
                            for (let i = headerRow + 1; i < rows.length; i++) {
                              const row = rows[i];
                              if (!row[fechaIdx]) continue;
                              const debito = parseFloat(row[debitoIdx]) || 0;
                              const credito = parseFloat(row[creditoIdx]) || 0;
                              if (debito === 0 && credito === 0) continue;
                              movimientos.push({
                                id: i,
                                fecha: String(row[fechaIdx] || ''),
                                referencia: String(row[refIdx] || ''),
                                descripcion: String(row[descIdx] || ''),
                                debito,
                                credito,
                                tipo: credito > 0 ? 'credito' : 'debito',
                                monto: credito > 0 ? credito : debito,
                                conciliado: false,
                                clienteMatch: null,
                              });
                            }
                            // Match automático: por monto + por nombre en descripción
                            const movsConciliados = movimientos.map(mov => {
                              if (mov.tipo !== 'credito') return mov;
                              const descUpper = mov.descripcion.toUpperCase();
                              // 1. Match por nombre del cliente en la descripción
                              let match = clientes.find(c => {
                                if (!c.nombre) return false;
                                const palabras = c.nombre.toUpperCase().split(' ').filter(p => p.length > 3);
                                return palabras.some(p => descUpper.includes(p));
                              });
                              // 2. Si no hay match por nombre, buscar por monto exacto
                              if (!match) {
                                match = clientes.find(c => {
                                  const monto = parseFloat(c.monto) || 0;
                                  return Math.abs(monto - mov.monto) < 1;
                                });
                              }
                              // 3. Match por referencia/contacto
                              if (!match) {
                                match = clientes.find(c => {
                                  const contacto = (c.contacto || '').replace(/\D/g, '');
                                  return contacto.length > 6 && descUpper.includes(contacto.slice(-7));
                                });
                              }
                              const confianza = match ? (descUpper.includes(match.nombre.toUpperCase().split(' ')[0]) ? 'alto' : 'medio') : null;
                              return { ...mov, conciliado: !!match, clienteMatch: match ? match.nombre : null, confianza };
                            });
                            setBancoMovimientos(movsConciliados);
                            showToast(`${movsConciliados.length} movimientos importados`, 'success');
                          } else {
                            showToast('Error cargando librería Excel', 'error');
                          }
                        } catch(err) {
                          showToast('Error al leer el archivo: ' + err.message, 'error');
                        }
                      };
                      reader.readAsArrayBuffer(file);
                    }} />
                  </label>
                  </div>
                </div>
              </div>

              {/* Resumen */}
              {bancoMovimientos.length > 0 && (() => {
                const creditos = bancoMovimientos.filter(m => m.tipo === 'credito');
                const conciliados = creditos.filter(m => m.conciliado);
                const noConciliados = creditos.filter(m => !m.conciliado);
                const totalBanco = creditos.reduce((s, m) => s + m.monto, 0);
                const totalConciliado = conciliados.reduce((s, m) => s + m.monto, 0);
                return (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'0.75rem' }}>
                    {[
                      { label:'Total Créditos Banco', value:`$${totalBanco.toLocaleString('en-US', { maximumFractionDigits:0 })}`, color:'#0284c7', sub:`${creditos.length} movimientos` },
                      { label:'Conciliados', value:`$${totalConciliado.toLocaleString('en-US', { maximumFractionDigits:0 })}`, color:'#059669', sub:`${conciliados.length} coinciden` },
                      { label:'Sin conciliar', value:`$${(totalBanco - totalConciliado).toLocaleString('en-US', { maximumFractionDigits:0 })}`, color:'#dc2626', sub:`${noConciliados.length} pendientes` },
                      { label:'Registrado en Sistema', value:`$${(estadisticas.montoPagado||0).toLocaleString('en-US', { maximumFractionDigits:0 })}`, color:'#7c3aed', sub:'Pagados este mes' },
                    ].map((k, i) => (
                      <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'1rem 1.1rem' }}>
                        <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', marginBottom:'0.3rem' }}>{k.label}</div>
                        <div style={{ fontSize:'1.4rem', fontWeight:800, color:k.color, fontFamily:'var(--mono)' }}>{k.value}</div>
                        <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.15rem' }}>{k.sub}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Tabla de movimientos */}
              {bancoMovimientos.length > 0 ? (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden' }}>
                  <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
                    <div style={{ fontWeight:700, fontSize:'0.9rem' }}>Movimientos del Banco — {bancoArchivoNombre}</div>
                    <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
                      <input type="date" value={bancoFechaDesde} onChange={e => setBancoFechaDesde(e.target.value)} style={{ padding:'0.3rem 0.6rem', border:'1px solid var(--border)', borderRadius:'6px', fontSize:'0.75rem', background:'var(--surface-2)', color:'var(--text)' }} />
                      <span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>—</span>
                      <input type="date" value={bancoFechaHasta} onChange={e => setBancoFechaHasta(e.target.value)} style={{ padding:'0.3rem 0.6rem', border:'1px solid var(--border)', borderRadius:'6px', fontSize:'0.75rem', background:'var(--surface-2)', color:'var(--text)' }} />
                      {(bancoFechaDesde || bancoFechaHasta) && <button onClick={() => { setBancoFechaDesde(''); setBancoFechaHasta(''); }} style={{ padding:'0.3rem 0.5rem', borderRadius:'6px', fontSize:'0.72rem', fontWeight:700, cursor:'pointer', background:'rgba(220,38,38,0.1)', color:'#dc2626', border:'1px solid rgba(220,38,38,0.2)' }}>✕</button>}
                      <div style={{ width:'1px', height:'20px', background:'var(--border)' }}></div>
                      {['todos','conciliado','pendiente'].map(f => (
                        <button key={f} onClick={() => setBancoFiltro(f)} style={{ padding:'0.3rem 0.75rem', borderRadius:'6px', fontSize:'0.75rem', fontWeight:600, cursor:'pointer', background: bancoFiltro === f ? 'var(--brand)' : 'var(--surface-2)', color: bancoFiltro === f ? 'white' : 'var(--text-muted)', border:'1px solid var(--border)' }}>
                          {f === 'todos' ? 'Todos' : f === 'conciliado' ? <><CheckCircle size={12}/> Conciliados</> : <><AlertTriangle size={12}/> Pendientes</>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                      <thead>
                        <tr style={{ background:'var(--surface-2)' }}>
                          {['Fecha','Referencia','Descripción','Débito','Crédito','Estado','Cliente Match'].map(h => (
                            <th key={h} style={{ padding:'0.6rem 0.9rem', textAlign:'left', fontWeight:700, fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bancoMovimientos
                          .filter(m => {
                            const estadoOk = bancoFiltro === 'todos' ? true : bancoFiltro === 'conciliado' ? m.conciliado : !m.conciliado;
                            if (!estadoOk) return false;
                            if (bancoFechaDesde && m.fecha < bancoFechaDesde.split('-').reverse().join('-')) return false;
                            if (bancoFechaHasta && m.fecha > bancoFechaHasta.split('-').reverse().join('-')) return false;
                            return true;
                          })
                          .map((m, i) => (
                          <tr key={m.id} style={{ borderBottom:'1px solid var(--border)', background: m.conciliado ? 'rgba(5,150,105,0.03)' : 'transparent' }}>
                            <td style={{ padding:'0.6rem 0.9rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{m.fecha}</td>
                            <td style={{ padding:'0.6rem 0.9rem', fontFamily:'var(--mono)', fontSize:'0.75rem', color:'var(--text-muted)' }}>{m.referencia}</td>
                            <td style={{ padding:'0.6rem 0.9rem', color:'var(--text)', maxWidth:'200px' }}>{m.descripcion}</td>
                            <td style={{ padding:'0.6rem 0.9rem', fontFamily:'var(--mono)', color:'#dc2626', fontWeight:600 }}>{m.debito > 0 ? `$${m.debito.toLocaleString('en-US', { maximumFractionDigits:0 })}` : ''}</td>
                            <td style={{ padding:'0.6rem 0.9rem', fontFamily:'var(--mono)', color:'#059669', fontWeight:600 }}>{m.credito > 0 ? `$${m.credito.toLocaleString('en-US', { maximumFractionDigits:0 })}` : ''}</td>
                            <td style={{ padding:'0.6rem 0.9rem' }}>
                              <span style={{ padding:'0.2rem 0.6rem', borderRadius:'5px', fontSize:'0.7rem', fontWeight:700, background: m.conciliado ? 'rgba(5,150,105,0.1)' : 'rgba(220,38,38,0.1)', color: m.conciliado ? '#059669' : '#dc2626' }}>
                                {m.conciliado ? (m.confianza === 'alto' ? <><CheckCircle size={12}/> Alto</> : <><AlertTriangle size={12}/> Medio</>) : <><AlertTriangle size={12}/> Pendiente</>}
                              </span>
                            </td>
                            <td style={{ padding:'0.6rem 0.9rem', fontSize:'0.78rem', color:'var(--text-muted)' }}>
                              {m.clienteMatch || '—'}
                              {!m.conciliado && m.tipo === 'credito' && (
                                <select style={{ marginLeft:'0.5rem', fontSize:'0.72rem', padding:'0.2rem 0.4rem', border:'1px solid var(--border)', borderRadius:'5px', background:'var(--surface-2)', color:'var(--text)', cursor:'pointer' }}
                                  onChange={e => {
                                    if (!e.target.value) return;
                                    setBancoMovimientos(prev => prev.map(x => x.id === m.id ? { ...x, conciliado: true, clienteMatch: e.target.value, confianza: 'manual' } : x));
                                  }}
                                  defaultValue="">
                                  <option value="">+ Asignar cliente</option>
                                  {clientes.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                                </select>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ background:'var(--surface)', border:'2px dashed var(--border)', borderRadius:'14px', padding:'3rem', textAlign:'center' }}>
                  <Briefcase size={40} style={{ color:'var(--text-muted)', marginBottom:'0.75rem' }}/>
                  <div style={{ fontWeight:700, fontSize:'0.95rem', color:'var(--text)', marginBottom:'0.4rem' }}>Sube el estado de cuenta del banco</div>
                  <div style={{ fontSize:'0.82rem', color:'var(--text-muted)' }}>Compatible con BHD, Reservas y Popular · Formato Excel (.xlsx)</div>
                </div>
              )}

              {/* Historial de Conciliaciones */}
              {historialConciliaciones.length > 0 && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden', marginTop:'1rem' }}>
                  <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontWeight:700, fontSize:'0.9rem' }}>📁 Historial de Conciliaciones</div>
                    <button onClick={() => { setHistorialConciliaciones([]); fetch('/api/historial-conciliaciones', { method:'DELETE' }).catch(()=>{}); }} style={{ fontSize:'0.72rem', color:'#dc2626', background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:'6px', padding:'0.25rem 0.6rem', cursor:'pointer', fontWeight:600 }}>Limpiar historial</button>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                      <thead>
                        <tr style={{ background:'var(--surface-2)' }}>
                          {['Fecha','Archivo','Total Movs','Conciliados','Pendientes','Usuario','Acción'].map(h => (
                            <th key={h} style={{ padding:'0.6rem 0.9rem', textAlign:'left', fontWeight:700, fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-muted)', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {historialConciliaciones.map((h, i) => (
                          <tr key={h.id} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'0.6rem 0.9rem', whiteSpace:'nowrap', color:'var(--text-muted)' }}>{h.fecha}</td>
                            <td style={{ padding:'0.6rem 0.9rem', fontSize:'0.78rem', color:'var(--text)' }}>{h.archivo}</td>
                            <td style={{ padding:'0.6rem 0.9rem', fontFamily:'var(--mono)', fontWeight:600 }}>{h.total}</td>
                            <td style={{ padding:'0.6rem 0.9rem', fontFamily:'var(--mono)', color:'#059669', fontWeight:700 }}>{h.conciliados}</td>
                            <td style={{ padding:'0.6rem 0.9rem', fontFamily:'var(--mono)', color: h.pendientes > 0 ? '#dc2626' : '#059669', fontWeight:700 }}>{h.pendientes}</td>
                            <td style={{ padding:'0.6rem 0.9rem', fontSize:'0.78rem', color:'var(--text-muted)' }}>{h.usuario}</td>
                            <td style={{ padding:'0.6rem 0.9rem' }}>
                              <button onClick={() => { setBancoMovimientos(h.movimientos); setBancoArchivoNombre(h.archivo); showToast('Conciliación restaurada', 'success'); }} style={{ fontSize:'0.72rem', padding:'0.25rem 0.6rem', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', cursor:'pointer', fontWeight:600 }}>
                                Restaurar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>}

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
                      const totalMonto = clientesAgente.reduce((s, c) => {
                        const docs = cotizaciones[c.id] || [];
                        const montoCots = docs.reduce((sum, d) => sum + (parseFloat(d.monto) || 0), 0);
                        return s + (montoCots > 0 ? montoCots : (parseFloat(c.monto) || 0));
                      }, 0);
                      const totalCreditos = creditosAgente.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
                      const totalDocs = clientesAgente.reduce((s, c) => s + (cotizaciones[c.id] || []).length, 0);
                      const clientesSinDoc = clientesAgente.filter(c => (cotizaciones[c.id] || []).length === 0 && c.estado === 'Cotizado').length;
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
                            <div style={{ background: 'var(--surface2)', borderRadius: '9px', padding: '0.7rem', textAlign: 'center' }}>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0284c7' }}>{totalDocs}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>DOCUMENTOS</div>
                            </div>
                            <div style={{ background: clientesSinDoc > 0 ? '#fffbeb' : 'var(--surface2)', border: clientesSinDoc > 0 ? '1px solid #fde68a' : 'none', borderRadius: '9px', padding: '0.7rem', textAlign: 'center' }}>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: clientesSinDoc > 0 ? '#b45309' : 'var(--text-muted)' }}>{clientesSinDoc}</div>
                              <div style={{ fontSize: '0.7rem', color: clientesSinDoc > 0 ? '#b45309' : 'var(--text-muted)', fontWeight: 600 }}>SIN DOCUMENTO</div>
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
                          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <button onClick={() => { setFiltroAgente(agente); setActiveTab('cartera'); }} style={{ width: '100%', padding: '0.5rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                              Ver cartera de {nombreUsuario}
                            </button>
                            {totalDocs > 0 && (
                              <button onClick={() => borrarDocsAgente(agente)} style={{ width: '100%', padding: '0.45rem', background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                                Eliminar todos los documentos
                              </button>
                            )}
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
                                    {d.permisos.can_edit && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><Pencil size={10}/> Editar</span>}
                                    {d.permisos.can_register_payments && <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><DollarSign size={10}/> Pagos</span>}
                                    {d.permisos.can_delete && <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#991b1b', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><Trash2 size={10}/> Eliminar</span>}
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
                              {d.permisos.can_edit && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#166534', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><Pencil size={10}/> Editar</span>}
                              {d.permisos.can_register_payments && <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><DollarSign size={10}/> Pagos</span>}
                              {d.permisos.can_delete && <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#991b1b', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><Trash2 size={10}/> Eliminar</span>}
                              {d.permisos.read_only || (!d.permisos.can_edit && !d.permisos.can_register_payments && !d.permisos.can_delete) && <span style={{ fontSize: '0.65rem', background: 'var(--surface2)', color: 'var(--text-muted)', padding: '0.1rem 0.4rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><Eye size={10}/> Solo lectura</span>}
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

          {/* TAB USUARIOS */}
          {esAdmin && <div className={`tab-content ${activeTab === 'usuarios' ? 'active' : ''}`}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
              <div>
                <h2 style={{ margin:0, fontWeight:800, fontSize:'1.15rem', color:'var(--text)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <Users size={18} color="#6366f1"/> Usuarios
                </h2>
                <p style={{ margin:'0.15rem 0 0', fontSize:'0.78rem', color:'var(--text-muted)' }}>
                  {Object.keys(usuarios).length} usuario{Object.keys(usuarios).length !== 1 ? 's' : ''} registrado{Object.keys(usuarios).length !== 1 ? 's' : ''}
                </p>
              </div>
              <button className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.82rem' }}
                onClick={() => { cargarUsuarios(); setUsuarioEditando(null); setUsuarioForm({ username:'', nombre:'', pass:'', rol:'viewer' }); setShowUsuariosModal(true); }}>
                <Plus size={14}/> Nuevo usuario
              </button>
            </div>

            <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border)', background:'var(--surface)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem', minWidth:600 }}>
                <thead>
                  <tr style={{ background:'var(--surface-2)', borderBottom:'2px solid var(--border)' }}>
                    <th style={{ padding:'0.7rem 1.1rem', textAlign:'left', fontWeight:700, fontSize:'0.69rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>Usuario</th>
                    <th style={{ padding:'0.7rem 1rem', textAlign:'left', fontWeight:700, fontSize:'0.69rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Email</th>
                    <th style={{ padding:'0.7rem 1rem', textAlign:'left', fontWeight:700, fontSize:'0.69rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Cargo</th>
                    <th style={{ padding:'0.7rem 1rem', textAlign:'left', fontWeight:700, fontSize:'0.69rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>Último Login</th>
                    <th style={{ padding:'0.7rem 1rem', width:'90px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(usuarios).map(([key, u], idx) => {
                    const adm = usuariosAdmin[key] || {};
                    const ROL_LABEL = { admin:'Administrador', editor:'Editor', agente_cobro:'Agente de Cobro', contabilidad:'Contabilidad', supervisor_cobro:'Supervisor Cobro', supervisor_contabilidad:'Supervisor Contabilidad', viewer:'Viewer' };
                    const esOp = ['editor','agente_cobro','contabilidad','supervisor_cobro','supervisor_contabilidad'].includes(u.rol);
                    const rolBg = u.rol==='admin' ? '#fef9c3' : esOp ? '#f0fdf4' : '#f0f9ff';
                    const rolBd = u.rol==='admin' ? '#fde047' : esOp ? '#86efac' : '#bae6fd';
                    const rolCl = u.rol==='admin' ? '#713f12' : esOp ? '#166534' : '#075985';
                    const av = getAvatar(u.nombre || key);
                    const login = adm.ultimoLogin ? new Date(adm.ultimoLogin) : null;
                    const loginStr = login
                      ? login.toLocaleDateString('es-DO', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + login.toLocaleTimeString('es-DO', { hour:'2-digit', minute:'2-digit' })
                      : '—';
                    return (
                      <tr key={key} style={{ borderBottom:'1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                        <td style={{ padding:'0.85rem 1.1rem' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
                            <div className="avatar avatar-sm" style={{ background: av.color, flexShrink:0 }}>{av.letra}</div>
                            <div>
                              <div style={{ fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                                {u.nombre || key}
                                {key === currentUser && <span style={{ background:'var(--brand)', color:'#fff', borderRadius:'20px', padding:'0.05rem 0.45rem', fontSize:'0.6rem', fontWeight:800 }}>TÚ</span>}
                              </div>
                              <div style={{ fontSize:'0.71rem', color:'var(--text-muted)', fontFamily:'var(--mono)' }}>@{key}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'0.85rem 1rem', color: adm.email ? 'var(--text)' : 'var(--text-xlight)', fontSize:'0.82rem' }}>
                          {adm.email || '—'}
                        </td>
                        <td style={{ padding:'0.85rem 1rem' }}>
                          <span style={{ background:rolBg, border:`1px solid ${rolBd}`, color:rolCl, borderRadius:'20px', padding:'0.2rem 0.7rem', fontSize:'0.72rem', fontWeight:700, whiteSpace:'nowrap' }}>
                            {ROL_LABEL[u.rol] || u.rol}
                          </span>
                        </td>
                        <td style={{ padding:'0.85rem 1rem', fontSize:'0.79rem', color: login ? 'var(--text)' : 'var(--text-xlight)', whiteSpace:'nowrap' }}>
                          {loginStr}
                        </td>
                        <td style={{ padding:'0.85rem 1rem' }}>
                          <div style={{ display:'flex', gap:'0.35rem', justifyContent:'flex-end' }}>
                            <button title="Editar"
                              onClick={() => { cargarUsuarios(); editarUsuario(key); setShowUsuariosModal(true); }}
                              style={{ padding:'0.35rem 0.6rem', border:'1px solid var(--border-2)', borderRadius:'7px', background:'var(--surface-2)', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
                              <Pencil size={13}/>
                            </button>
                            {key !== currentUser && (
                              <button title="Eliminar"
                                onClick={() => eliminarUsuario(key)}
                                style={{ padding:'0.35rem 0.6rem', border:'1px solid #fca5a5', borderRadius:'7px', background:'#fee2e2', color:'#dc2626', cursor:'pointer', display:'flex', alignItems:'center' }}>
                                <Trash2 size={13}/>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {Object.keys(usuarios).length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)' }}>
                        <Users size={32} style={{ opacity:0.2, display:'block', margin:'0 auto 0.75rem' }}/>
                        No hay usuarios registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>}

          {/* MODALES */}
          {/* Modal Cliente */}
          <div className={`modal ${showModal ? 'show' : ''}`}>
            <div className="modal-content" style={{ maxWidth: '620px', width: '95vw', padding: 0, borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg, #1e2d4a 0%, #2d4170 100%)', padding: '1.25rem 1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff', display:'flex', alignItems:'center', gap:'0.4rem' }}>{editingCliente ? <><Pencil size={15}/> Editar Cliente</> : <><Plus size={15}/> Nuevo Cliente</>}</h2>
                  {editingCliente && <div style={{ fontSize: '0.75rem', color: '#93c5fd', marginTop: '0.2rem' }}>ID #{formData.id} · Código {formData.codigoCliente || '—'}</div>}
                </div>
                <button className="close-btn" onClick={cerrarModal} style={{ color: '#fff', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              <form onSubmit={guardarCliente} style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '75vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Código de Cliente</label>
                    <input type="number" value={formData.codigoCliente || ''} onChange={(e) => setFormData({ ...formData, codigoCliente: e.target.value })} placeholder="Ej: 1001" style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box', transition: 'border-color 0.2s' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Contacto (Teléfono)</label>
                    <input type="text" value={formData.contacto} onChange={(e) => { setFormData({ ...formData, contacto: e.target.value }); detectarDuplicados(formData.nombre, e.target.value); }} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Nombre del Cliente *</label>
                  <input type="text" value={formData.nombre} onChange={(e) => { setFormData({ ...formData, nombre: e.target.value }); detectarDuplicados(e.target.value, formData.contacto); }} required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: `1.5px solid ${!editingCliente && duplicadosAlerta.length > 0 ? '#f59e0b' : '#e2e8f0'}`, fontSize: '0.9rem', boxSizing: 'border-box', transition: 'border-color 0.2s' }} />
                  {!editingCliente && duplicadosAlerta.length > 0 && (
                    <div style={{ marginTop: '0.5rem', background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '8px', padding: '0.6rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: '#92400e' }}>
                        <AlertTriangle size={12}/> Posible duplicado
                      </div>
                      {duplicadosAlerta.map(d => (
                        <div key={d.id} style={{ fontSize: '0.76rem', color: '#78350f', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600 }}>{d.nombre}</span>
                          <span style={{ color: '#a16207' }}>{d.contacto || '—'} · {d.estado}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Mes *</label>
                    <select value={formData.mes} onChange={(e) => setFormData({ ...formData, mes: e.target.value })} required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', background: '#fff', boxSizing: 'border-box' }}>
                      <option value="">Seleccionar...</option>{[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Año *</label>
                    <input type="number" value={formData.año} onChange={(e) => setFormData({ ...formData, año: e.target.value })} min="2024" max="2030" required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Estado *</label>
                    <select value={formData.estado} onChange={(e) => setFormData({ ...formData, estado: e.target.value })} required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', background: '#fff', boxSizing: 'border-box' }}>
                      {['Cotizado','Notificado','Pagado','Facturado','Vencido','Suspendido','No Generaron'].map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Monto</label>
                    <label style={{ cursor: pdfCargando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.7rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, color: '#475569', userSelect: 'none' }}>
                      {pdfCargando ? <><Loader2 size={12}/> Leyendo PDF…</> : <><FileText size={12}/> Leer desde factura PDF</>}
                      <input type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} disabled={pdfCargando} onChange={e => { if (e.target.files[0]) leerFacturaPDF(e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  </div>
                  <input type="number" value={formData.monto} onChange={(e) => setFormData({ ...formData, monto: e.target.value })} step="0.01" placeholder="Ej: 5000" style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, boxSizing: 'border-box', background: '#fff' }} />
                  {pdfError && <div style={{ fontSize: '0.73rem', color: '#dc2626', marginTop: '0.4rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.4rem 0.6rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><AlertTriangle size={12}/> {pdfError}</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Fecha de Cotización</label>
                    <input type="date" value={formData.fechaCotizacion} onChange={(e) => setFormData({ ...formData, fechaCotizacion: e.target.value })} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Comentario</label>
                    <textarea value={formData.comentario} onChange={(e) => setFormData({ ...formData, comentario: e.target.value })} rows={2} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                </div>
                {editingCliente && formData.historial && formData.historial.length > 0 && (
                  <div style={{ marginTop:'1rem' }}>
                    <div style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:'0.75rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--brand)' }}></div>
                      Historial de cambios ({formData.historial.length})
                    </div>
                    <div style={{ maxHeight:'200px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'0', paddingRight:'0.25rem' }}>
                      {[...formData.historial].reverse().map((h, idx) => {
                        const esReciente = idx === 0;
                        const accion = h.accion || '';
                        const color = accion.toLowerCase().includes('pagado') ? '#059669'
                          : accion.toLowerCase().includes('cotizado') ? '#ea580c'
                          : accion.toLowerCase().includes('notificado') ? '#0284c7'
                          : accion.toLowerCase().includes('facturado') ? '#16a34a'
                          : accion.toLowerCase().includes('vencido') ? '#dc2626'
                          : accion.toLowerCase().includes('eliminado') ? '#dc2626'
                          : 'var(--brand)';
                        return (
                          <div key={idx} style={{ display:'flex', gap:'0.75rem', paddingBottom:'0.6rem', position:'relative' }}>
                            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                              <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: esReciente ? color : 'var(--border-2)', border:`2px solid ${esReciente ? color : 'var(--border)'}`, marginTop:'3px', flexShrink:0 }}></div>
                              {idx < formData.historial.length - 1 && <div style={{ width:'1px', flex:1, background:'var(--border)', marginTop:'3px' }}></div>}
                            </div>
                            <div style={{ flex:1, paddingBottom:'0.1rem' }}>
                              <div style={{ fontSize:'0.78rem', fontWeight: esReciente ? 600 : 400, color: esReciente ? 'var(--text)' : 'var(--text-muted)' }}>{h.accion}</div>
                              <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginTop:'0.15rem' }}>
                                {h.usuario && <span style={{ fontSize:'0.65rem', fontWeight:700, color:'var(--brand)', background:'var(--brand-bg)', padding:'0.05rem 0.4rem', borderRadius:'9px' }}>{h.usuario}</span>}
                                <span style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>{new Date(h.fecha).toLocaleString('es-DO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
                  <button type="button" onClick={cerrarModal} style={{ padding: '0.65rem 1.5rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Cancelar</button>
                  <button type="submit" style={{ padding: '0.65rem 1.75rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1e2d4a, #2d4170)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display:'flex', alignItems:'center', gap:'0.4rem' }}>{editingCliente ? <><Save size={14}/> Actualizar</> : <><Plus size={14}/> Guardar</>}</button>
                </div>
              </form>
            </div>
          </div>

          {/* Modal Crédito */}
          <div className={`modal ${showCreditoModal ? 'show' : ''}`}>
            <div className="modal-content" style={{ maxWidth: '620px', width: '95vw', padding: 0, borderRadius: '16px', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1a2d1a 0%, #1e3d2f 100%)', padding: '1.25rem 1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {editingCredito ? <><Pencil size={15}/> Editar Crédito</> : <><CreditCard size={15}/> Nuevo Crédito</>}
                  </h2>
                  {editingCredito && <div style={{ fontSize: '0.75rem', color: '#86efac', marginTop: '0.2rem' }}>ID #{creditoFormData.id} · Orden {creditoFormData.numeroOrden || '—'}</div>}
                </div>
                <button onClick={cerrarCreditoModal} style={{ color: '#fff', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16}/>
                </button>
              </div>

              {/* Body */}
              <form onSubmit={guardarCredito} style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '75vh', overflowY: 'auto' }}>

                {/* Fila 1: Orden + Cliente */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Número de Orden *</label>
                    <input type="text" value={creditoFormData.numeroOrden} onChange={(e) => setCreditoFormData({ ...creditoFormData, numeroOrden: e.target.value })} placeholder="Ej: 144001" required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Estado *</label>
                    <select value={creditoFormData.estado} onChange={(e) => setCreditoFormData({ ...creditoFormData, estado: e.target.value })} required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', background: '#fff', boxSizing: 'border-box' }}>
                      {['Activo','Por Vencer','Vencido','Pagado'].map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>

                {/* Cliente con autocomplete */}
                <div style={{ margin: 0 }} className="autocomplete-container">
                  <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Cliente *</label>
                  <input type="text" value={creditoFormData.cliente} onChange={(e) => manejarCambioCliente(e.target.value)} onKeyDown={manejarTecladoAutocomplete} placeholder="Escribe el nombre del cliente..." autoComplete="off" required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                  {mostrarAutocomplete && clientesFiltradosAuto.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {clientesFiltradosAuto.map((cliente, index) => (
                        <div key={cliente.id} className={`autocomplete-item ${index === selectedAutoIndex ? 'selected' : ''}`} onClick={() => seleccionarClienteAutocomplete(cliente)} onMouseEnter={() => setSelectedAutoIndex(index)}>
                          <span className="cliente-nombre">{cliente.nombre}</span>
                          <span className="cliente-id">ID: {cliente.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Monto */}
                <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Monto del Crédito *</label>
                  <input type="number" value={creditoFormData.monto} onChange={(e) => setCreditoFormData({ ...creditoFormData, monto: e.target.value })} step="0.01" placeholder="Ej: 129600" required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, boxSizing: 'border-box', background: '#fff' }} />
                </div>

                {/* Fechas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Fecha de Inicio *</label>
                    <input type="date" value={creditoFormData.fechaInicio} onChange={(e) => { const nd = { ...creditoFormData, fechaInicio: e.target.value }; if (nd.fechaVencimiento) { const i = new Date(e.target.value); const f = new Date(nd.fechaVencimiento); nd.plazoMeses = Math.max(1, ((f.getFullYear() - i.getFullYear()) * 12) + (f.getMonth() - i.getMonth())).toString(); } setCreditoFormData(nd); }} required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Fecha de Vencimiento *</label>
                    <input type="date" value={creditoFormData.fechaVencimiento} onChange={(e) => { const nd = { ...creditoFormData, fechaVencimiento: e.target.value }; if (nd.fechaInicio) { const i = new Date(nd.fechaInicio); const f = new Date(e.target.value); nd.plazoMeses = Math.max(1, ((f.getFullYear() - i.getFullYear()) * 12) + (f.getMonth() - i.getMonth())).toString(); } setCreditoFormData(nd); }} required style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Plazo calculado */}
                {creditoFormData.fechaInicio && creditoFormData.fechaVencimiento && (
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: '9px', fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={14} style={{ color: '#0ea5e9' }}/>
                    Plazo calculado:
                    <span style={{ color: '#0ea5e9', fontWeight: 800, fontSize: '1rem' }}>{creditoFormData.plazoMeses || '0'} {creditoFormData.plazoMeses === '1' ? 'mes' : 'meses'}</span>
                  </div>
                )}

                {/* Comentario */}
                <div style={{ margin: 0 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.4rem', display: 'block' }}>Comentario</label>
                  <textarea value={creditoFormData.comentario} onChange={(e) => setCreditoFormData({ ...creditoFormData, comentario: e.target.value })} style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box', resize: 'vertical', minHeight: '70px', fontFamily: 'inherit' }} />
                </div>

                {/* Abonos */}
                {creditoFormData.monto && parseFloat(creditoFormData.monto) > 0 && (
                  <div className="abonos-section">
                    <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><DollarSign size={14}/> Abonos</h3>
                    <div className="saldo-info">
                      {[['Total', 'total', '#0284c7'], ['Abonado', 'abonado', '#059669'], ['Pendiente', 'pendiente', '#f97316']].map(([label, key, color]) => { const s = calcularSaldosCredito(creditoFormData.monto, creditoFormData.abonos); return <div key={key} className="saldo-item"><label>{label}</label><div className="valor" style={{ color }}>${s[key].toFixed(2)}</div></div>; })}
                    </div>
                    <div className="abono-input-group">
                      <input type="number" value={nuevoAbono} onChange={(e) => setNuevoAbono(e.target.value)} placeholder="Monto del abono..." step="0.01" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarAbono(); } }} />
                      <button type="button" onClick={agregarAbono} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Plus size={13}/> Agregar</button>
                    </div>
                    {creditoFormData.abonos && creditoFormData.abonos.length > 0 && creditoFormData.abonos.map(abono => (
                      <div key={abono.id} className="abono-item">
                        <div><div className="abono-monto">${abono.monto.toFixed(2)}</div><div className="abono-fecha">{abono.fechaFormato}</div></div>
                        <button type="button" onClick={() => eliminarAbono(abono.id)}><X size={13}/></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Acciones */}
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={cerrarCreditoModal}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">{editingCredito ? 'Actualizar Crédito' : 'Guardar Crédito'}</button>
                </div>

              </form>
            </div>
          </div>

          {/* Búsqueda Global */}
          {showBusquedaGlobal && (
            <div className="global-search-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowBusquedaGlobal(false); setBusquedaGlobal(''); }}}>
              <div className="global-search-box">

                {/* Input */}
                <div className="global-search-input-row">
                  <Search size={18} className="global-search-icon"/>
                  <input
                    autoFocus
                    type="text"
                    className="global-search-input"
                    placeholder="Buscar cliente, crédito, contacto..."
                    value={busquedaGlobal}
                    onChange={e => setBusquedaGlobal(e.target.value)}
                  />
                  <button className="global-search-close" onClick={() => { setShowBusquedaGlobal(false); setBusquedaGlobal(''); }}>
                    <X size={14}/>
                  </button>
                </div>

                {/* Results */}
                <div className="global-search-body">
                  {busquedaGlobal.length > 1 ? (() => {
                    const term = busquedaGlobal.toLowerCase();
                    const resClientes = clientes.filter(c => c.nombre.toLowerCase().includes(term) || c.id.toString().includes(term) || (c.contacto||'').includes(term));
                    const resCreditos = creditos.filter(c => c.cliente.toLowerCase().includes(term) || c.numeroOrden.toLowerCase().includes(term));
                    if (resClientes.length === 0 && resCreditos.length === 0) {
                      return (
                        <div className="global-search-empty">
                          <Search size={30}/>
                          <p>Sin resultados para <strong>"{busquedaGlobal}"</strong></p>
                        </div>
                      );
                    }
                    return (
                      <>
                        {resClientes.length > 0 && (
                          <div className="global-search-section">
                            <div className="global-search-section-label"><Users size={11}/> Cartera · {resClientes.length}</div>
                            {resClientes.map(c => (
                              <div key={c.id} className="global-search-result" onClick={() => { setActiveTab('cartera'); setSearchTerm(c.nombre); setShowBusquedaGlobal(false); setBusquedaGlobal(''); }}>
                                <div className="global-search-result-info">
                                  <span className="global-search-result-name">{c.nombre}</span>
                                  <span className="global-search-result-sub">#{c.id}</span>
                                </div>
                                <span className={`badge badge-${(c.estado||'').toLowerCase().replace(/ /g,'-')}`}>{c.estado}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {resCreditos.length > 0 && (
                          <div className="global-search-section">
                            <div className="global-search-section-label"><CreditCard size={11}/> Créditos · {resCreditos.length}</div>
                            {resCreditos.map(c => (
                              <div key={c.id} className="global-search-result" onClick={() => { setActiveTab('credito'); setShowBusquedaGlobal(false); setBusquedaGlobal(''); }}>
                                <div className="global-search-result-info">
                                  <span className="global-search-result-name">{c.cliente}</span>
                                  <span className="global-search-result-sub">Orden {c.numeroOrden}</span>
                                </div>
                                <span className={`badge badge-${(c.estado||'').toLowerCase().replace(/ /g,'-')}`}>{c.estado}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })() : (
                    <div className="global-search-hint">
                      Escribe al menos 2 caracteres para buscar
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="global-search-footer">
                  <span><kbd>ESC</kbd> cerrar</span>
                  <span><kbd>F</kbd> abrir</span>
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
                      { icon: <FileText size={11}/>, label: 'Factura', msg: getMsgFactura(whatsappCliente) },
                      { icon: <DollarSign size={11}/>, label: 'Cobro', msg: `Hola ${whatsappCliente.nombre}, le recordamos que tiene un saldo pendiente de *$${(parseFloat(whatsappCliente.monto)||0).toLocaleString('en-US')}*. Por favor gestione su pago. Gracias.` },
                      { icon: <Clock size={11}/>, label: 'Recordatorio', msg: `Hola ${whatsappCliente.nombre}, le contactamos para recordarle sobre su cuenta con estado *${whatsappCliente.estado}*. Quedamos atentos.` },
                      { icon: <CheckCircle size={11}/>, label: 'Confirmación', msg: `Hola ${whatsappCliente.nombre}, confirmamos la recepción de su pago. Gracias por su gestión.` },
                    ].map(t => <button key={t.label} onClick={() => setWhatsappMensaje(t.msg)} style={{ padding: '0.35rem 0.75rem', borderRadius: '7px', border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display:'flex', alignItems:'center', gap:'0.35rem' }}>{t.icon}{t.label}</button>)}
                  </div>
                </div>
                <div className="form-group">
                  <label>Mensaje</label>
                  <textarea value={whatsappMensaje} onChange={e => setWhatsappMensaje(e.target.value)} rows={6} style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border2)', borderRadius: '9px', fontSize: '0.9rem', fontFamily: 'Plus Jakarta Sans, sans-serif', resize: 'vertical', background: 'var(--surface)', color: 'var(--text)' }} />
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowWhatsappModal(false)}>Cancelar</button>
                  <button className="btn btn-success" onClick={enviarWhatsapp}><MessageSquare size={13}/> Enviar por WhatsApp</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Importar Excel */}
          {showImportModal && (
            <div className="modal show">
              <div className="modal-content" style={{ maxWidth: '460px' }}>
                <div className="modal-header">
                  <h2><Download size={15}/> Importar Clientes desde Excel</h2>
                  <button className="close-btn" onClick={() => setShowImportModal(false)}>×</button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>El archivo Excel debe tener estas columnas:</p>
                <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '0.9rem', marginBottom: '1.25rem', fontFamily: 'var(--mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  ID | Nombre | Contacto | Estado | Mes | Año | Monto | Comentario
                </div>
                <div style={{ textAlign: 'center', padding: '1.5rem', border: '2px dashed var(--border2)', borderRadius: '12px' }}>
                  <div style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}><FolderOpen size={40}/></div>
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
            let balance = 0;
            return (
              <div className="modal show">
                <div className="modal-content" style={{ maxWidth: '780px', width: '95vw', padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                  <div className="modal-header" style={{ background: '#1e2d4a', color: '#fff', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>Balance {historialPagosCliente.nombre}</h2>
                    <button className="close-btn" style={{ color: '#fff', fontSize: '1.4rem', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowHistorialPagosModal(false)}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem', padding: '1rem 1.5rem 0.5rem' }}>
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
                  <div style={{ padding: '0.75rem 1.5rem', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#1e2d4a', color: '#fff' }}>
                          <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left', fontWeight: 600 }}>Fecha</th>
                          <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left', fontWeight: 600 }}>Género</th>
                          <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left', fontWeight: 600 }}>Concepto</th>
                          <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 600 }}>Cantidad</th>
                          <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 600 }}>Monto</th>
                          <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 600 }}>Balance</th>
                          <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 600 }}>Recibo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagos.length === 0 ? (
                          <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                            <div style={{ marginBottom: '0.5rem' }}><DollarSign size={32}/></div>
                            <p>No hay pagos registrados aún.</p>
                          </td></tr>
                        ) : (
                          pagos.map((pago, i) => {
                            const monto = parseFloat(pago.monto) || 0;
                            balance -= monto;
                            return (
                              <tr key={pago.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '0.6rem 0.8rem', color: '#64748b' }}>{pago.fechaFormato || new Date(pago.fecha).toLocaleDateString('es-DO')}</td>
                                <td style={{ padding: '0.6rem 0.8rem', color: '#059669', fontWeight: 600 }}>Pago</td>
                                <td style={{ padding: '0.6rem 0.8rem', color: '#1e2d4a' }}>{pago.descripcion || pago.concepto || `Pago #${i + 1}`}</td>
                                <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', color: '#1e2d4a' }}>1</td>
                                <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: '#059669', fontWeight: 700, fontFamily: 'monospace' }}>-${monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: balance < 0 ? '#dc2626' : '#059669' }}>${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                                  <button onClick={() => generarReciboPDF(historialPagosCliente, pago)} title="Descargar recibo" style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0284c7', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}><FileText size={12}/></button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: '#f8fafc' }}>
                    <button className="btn btn-secondary" onClick={() => setShowHistorialPagosModal(false)}>Cerrar</button>
                    <button className="btn btn-success" onClick={() => { setShowHistorialPagosModal(false); setPagoClienteTarget(historialPagosCliente); setShowPagoModal(true); }}><DollarSign size={13}/> Agregar Pago</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Modal Pago Cliente */}
          {showPagoModal && pagoClienteTarget && (() => { const s = calcularSaldoCliente(pagoClienteTarget); return (
            <div className="modal show">
              <div className="modal-content" style={{ maxWidth: '560px', width: '95vw', padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                <div className="modal-header" style={{ background: '#1e2d4a', color: '#fff', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>Agregar Pago <span style={{ color: '#60a5fa' }}>{pagoClienteTarget.nombre}</span></h2>
                  <button className="close-btn" style={{ color: '#fff', fontSize: '1.4rem', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowPagoModal(false)}>×</button>
                </div>
                <div style={{ padding: '1.2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e2d4a' }}>* Cuenta de Banco</label>
                      <select value={pagoBanco || ''} onChange={e => setPagoBanco(e.target.value)} style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}>
                        <option value="">Seleccione</option>
                        <option value="BanReservas">BanReservas</option>
                        <option value="Popular">Popular</option>
                        <option value="BHD">BHD</option>
                        <option value="Scotiabank">Scotiabank</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e2d4a' }}>* Monto</label>
                      <input type="number" value={pagoMonto} onChange={e => setPagoMonto(e.target.value)} placeholder={`Max: $${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} step="0.01" min="0.01" autoFocus style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} onKeyDown={e => { if (e.key === 'Enter') confirmarPago(); }} />
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        <button type="button" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '5px', cursor: 'pointer', color: '#0284c7', fontWeight: 600 }} onClick={() => setPagoMonto(s.pendiente.toFixed(2))}>Total (${s.pendiente.toLocaleString('en-US', { maximumFractionDigits: 0 })})</button>
                        {s.pendiente > 0 && <button type="button" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px', cursor: 'pointer', color: '#15803d', fontWeight: 600 }} onClick={() => setPagoMonto((s.pendiente / 2).toFixed(2))}>50%</button>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e2d4a' }}>Tipo de Negocio</label>
                      <select value={pagoTipoNegocio || 'Servicio y Repuestos'} onChange={e => setPagoTipoNegocio(e.target.value)} style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff' }}>
                        <option value="Servicio y Repuestos">Servicio y Repuestos</option>
                        <option value="Venta">Venta</option>
                        <option value="Arriendo">Arriendo</option>
                        <option value="Consultoría">Consultoría</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e2d4a' }}>* Pagado el</label>
                      <input type="date" value={pagoFecha || new Date().toISOString().split('T')[0]} onChange={e => setPagoFecha(e.target.value)} style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e2d4a' }}>Referencia</label>
                    <textarea value={pagoReferencia || ''} onChange={e => setPagoReferencia(e.target.value)} placeholder="Número de referencia, descripción del pago..." rows={3} style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', background: '#f8fafc' }}>
                  <button className="btn btn-success" style={{ padding: '0.6rem 2.5rem', fontSize: '1rem', fontWeight: 700 }} onClick={confirmarPago}>Crear Pago</button>
                </div>
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
              <div className="modal-header"><h2><MessageCircle size={15}/> Nota del Cliente</h2><button className="close-btn" onClick={() => setShowNotaModal(false)}>✕</button></div>
              <p style={{ fontSize: '0.85rem', color: '#64748b' }}>{notaClienteId && clientes.find(c => c.id === notaClienteId)?.nombre}</p>
              <textarea value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)} placeholder="Escribe una nota..." />
              <div className="form-actions"><button className="btn btn-secondary" onClick={() => setShowNotaModal(false)}>Cancelar</button><button className="btn btn-success" onClick={guardarNota}><Save size={13}/> Guardar</button></div>
            </div>
          </div>

          {/* Modal Cierre de Mes */}
          <div className={`modal ${showDescargaMesModal ? 'show' : ''}`}>
            <div className="nota-modal-content">
              <div className="modal-header"><h2><Save size={15}/> Cierre de Mes — {obtenerNombreMes(obtenerMesActual())}</h2><button className="close-btn" onClick={() => setShowDescargaMesModal(false)}>✕</button></div>
              <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '1rem' }}>Esta acción realizará lo siguiente:</p>
              <ul style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.8, marginBottom: '1.5rem', paddingLeft: '1.2rem' }}>
                <li>Guarda el snapshot del mes en el historial</li>
                <li>Descarga el reporte Excel del mes</li>
                <li>Reinicia todos los clientes a "No Generaron"</li>
                <li>Elimina los documentos del mes anterior</li>
              </ul>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowDescargaMesModal(false)} style={{ flex: 1 }}>Cancelar</button>
                <button className="btn btn-primary" onClick={ejecutarCierreMes} style={{ flex: 1 }}><Save size={13}/> Confirmar Cierre</button>
              </div>
            </div>
          </div>

          <div id="save-indicator" className="save-indicator" style={{ display: 'none' }}></div>

          {/*  Modal: Notificación de Delegación Pendiente  */}
          {showPendienteModal && delegationsPendientes.length > 0 && (() => {
            const d = delegationsPendientes[pendienteIdx];
            if (!d) return null;
            return (
              <div className="modal show" style={{ zIndex: 100000 }}>
                <div className="modal-content" style={{ maxWidth: '480px', border: '2px solid #f97316' }}>
                  <div className="modal-header" style={{ background: 'linear-gradient(135deg, #fff7ed, #ffedd5)', borderRadius: '12px 12px 0 0' }}>
                    <h2 style={{ fontSize: '1.1rem', color: '#c2410c' }}><Inbox size={15}/> Solicitud de Delegación</h2>
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
                        {d.permisos.can_edit && <span style={{ fontSize: '0.78rem', background: '#dcfce7', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.3rem' }}><Pencil size={11}/> Editar</span>}
                        {d.permisos.can_register_payments && <span style={{ fontSize: '0.78rem', background: '#dbeafe', color: '#1e40af', padding: '0.2rem 0.6rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.3rem' }}><DollarSign size={11}/> Pagos</span>}
                        {d.permisos.can_delete && <span style={{ fontSize: '0.78rem', background: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.6rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.3rem' }}><Trash2 size={11}/> Eliminar</span>}
                        {d.permisos.read_only || (!d.permisos.can_edit && !d.permisos.can_register_payments && !d.permisos.can_delete) && <span style={{ fontSize: '0.78rem', background: 'var(--surface2)', color: 'var(--text-muted)', padding: '0.2rem 0.6rem', borderRadius: '9px', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:'0.3rem' }}><Eye size={11}/> Solo lectura</span>}
                      </div>
                    </div>
                    <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      ¿Deseas aceptar esta delegación? Si aceptas, los clientes aparecerán en tu cartera mientras dure el período asignado.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn-secondary" onClick={() => responderDelegacion(d.id, 'rechazar')} style={{ flex: 1 }}>Rechazar</button>
                      <button className="btn btn-primary" onClick={() => responderDelegacion(d.id, 'aceptar')} style={{ flex: 1, background: '#10b981', border: 'none' }}><CheckCircle size={13}/> Aceptar</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/*  Modal: Crear Delegación (Wizard 3 pasos)  */}
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
                            {t === 'total' ? 'Total (todos mis clientes)' : 'Parcial (seleccionar)'}
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
                      { key: 'can_edit', label: 'Puede editar datos del cliente', desc: 'Nombre, contacto, estado, monto, comentarios' },
                      { key: 'can_register_payments', label: 'Puede registrar y eliminar pagos', desc: 'Gestión del historial de pagos' },
                      { key: 'can_delete', label: 'Puede eliminar clientes', desc: 'Eliminación permanente (recomendado: desactivado)' },
                      { key: 'read_only', label: 'Solo lectura', desc: 'Bloquea edición, pagos y eliminación — solo visualización' },
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

          {/*  Modal de Confirmación  */}
          {confirmModal.show && (
            <div className="modal show" style={{ zIndex: 99999 }}>
              <div className="modal-content" style={{ maxWidth: '420px' }}>
                <div className="modal-header">
                  <h2 style={{ fontSize: '1.1rem', color: '#dc2626', display:'flex', alignItems:'center', gap:'0.5rem' }}><AlertTriangle size={18}/> {confirmModal.titulo}</h2>
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

      {/* Modal Documentos del Cliente */}
      {showDocsModal && docsClienteId && (() => {
        const cliente = clientes.find(c => c.id === docsClienteId);
        if (!cliente) return null;
        const docs = cotizaciones[docsClienteId] || [];
        return (
          <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowDocsModal(false); }}>
            <div className="modal-content" style={{ maxWidth: '620px', width: '96vw', padding: 0, borderRadius: '16px', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1e2d4a, #2d4170)', padding: '1.25rem 1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={15}/> Documentos</h2>
                  <div style={{ fontSize: '0.75rem', color: '#93c5fd', marginTop: '0.2rem' }}>{cliente.nombre} · {docs.length} documento{docs.length !== 1 ? 's' : ''}</div>
                </div>
                <button onClick={() => setShowDocsModal(false)} style={{ color: '#fff', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16}/></button>
              </div>

              {/* Acciones principales */}
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {tienePermiso('subir_documentos') && <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} onClick={() => { setShowDocsModal(false); abrirGenCotModal(cliente); }}><Pencil size={13}/> Generar Cotización</button>}
                {tienePermiso('subir_documentos') && <label className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: '0.78rem', padding: '0.4rem 0.85rem' }}>
                  <FolderOpen size={13}/> Subir PDF
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { subirDocumento(docsClienteId, e.target.files[0]); e.target.value = ''; }} />
                </label>}
                {tienePermiso('subir_documentos') && <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} onClick={() => setNuevaCotForm(f => ({ ...f, show: !f.show, monto: '', estado: 'Cotizado' }))}><Plus size={13}/> Cotización manual</button>}
                {docs.filter(d => d.base64).length > 0 && (
                  <button className="btn btn-success" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} onClick={() => { setShowDocsModal(false); abrirNotifDocModal(cliente); }}>
                    <Send size={13}/> Notificar
                  </button>
                )}
              </div>

              {/* Formulario nueva cotización manual */}
              {nuevaCotForm.show && (
                <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="number" placeholder="Monto RD$" value={nuevaCotForm.monto} onChange={e => setNuevaCotForm(f => ({ ...f, monto: e.target.value }))} style={{ flex: '1', minWidth: '120px', padding: '0.4rem 0.65rem', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '0.85rem' }} />
                  <select value={nuevaCotForm.estado} onChange={e => setNuevaCotForm(f => ({ ...f, estado: e.target.value }))} style={{ padding: '0.4rem 0.65rem', borderRadius: '7px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                    {['Cotizado','Notificado','Pagado','Facturado','Vencido'].map(est => <option key={est} value={est}>{est}</option>)}
                  </select>
                  <button className="btn btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }} onClick={() => { if (!nuevaCotForm.monto || parseFloat(nuevaCotForm.monto) <= 0) return; crearCotizacionManual(docsClienteId, nuevaCotForm.monto, nuevaCotForm.estado); setNuevaCotForm(f => ({ ...f, show: false, monto: '' })); }}>Guardar</button>
                  <button className="btn btn-secondary" style={{ padding: '0.4rem 0.65rem', fontSize: '0.82rem' }} onClick={() => setNuevaCotForm(f => ({ ...f, show: false }))}>Cancelar</button>
                </div>
              )}

              {/* Lista de documentos */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {docs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '12px' }}>
                    <Inbox size={40} style={{ marginBottom: '0.75rem', opacity: 0.4 }}/>
                    <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>Sin documentos aún</p>
                    <p style={{ fontSize: '0.82rem', margin: 0 }}>Genera, sube un PDF o crea una cotización manual</p>
                  </div>
                ) : docs.map(doc => {
                  const ESTADO_COLORS = { Cotizado: '#ea580c', Notificado: '#0284c7', Pagado: '#059669', Facturado: '#16a34a', Vencido: '#dc2626' };
                  const color = ESTADO_COLORS[doc.estado] || '#64748b';
                  const icono = doc.tipo === 'generado' ? <ClipboardList size={18}/> : doc.tipo === 'manual' ? <FileEdit size={18}/> : doc.tipo === 'legacy' ? <Archive size={18}/> : <FileText size={18}/>;
                  return (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ flexShrink: 0, color: 'var(--accent)', width: '32px', height: '32px', background: 'var(--accent-glow, #eff6ff)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icono}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nombre || (doc.tipo === 'manual' ? 'Cotización manual' : doc.tipo === 'legacy' ? 'Datos anteriores' : '—')}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', gap: '0.5rem' }}>
                          <span>{new Date(doc.fecha).toLocaleDateString('es-DO')}</span>
                          {doc.monto && <span style={{ color: '#059669', fontWeight: 700 }}>RD${parseFloat(doc.monto).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}
                        </div>
                      </div>
                      <select value={doc.estado || 'Cotizado'} onChange={e => actualizarEstadoCotizacion(docsClienteId, doc.id, e.target.value)} style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: `1.5px solid ${color}`, color, fontWeight: 700, fontSize: '0.75rem', background: color + '15', cursor: 'pointer', flexShrink: 0 }}>
                        {['Cotizado','Notificado','Pagado','Facturado','Vencido'].map(est => <option key={est} value={est}>{est}</option>)}
                      </select>
                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                        {doc.base64 && <button onClick={() => descargarDocumento(doc)} style={{ width: '30px', height: '30px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Download size={13}/></button>}
                        <button onClick={() => eliminarDocumento(docsClienteId, doc.id)} style={{ width: '30px', height: '30px', borderRadius: '7px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13}/></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: '0.65rem 1.5rem', borderTop: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                <Save size={11}/> Máx. recomendado: 3MB por archivo
              </div>
            </div>
          </div>
        );
      })()}

      {/*  Modal Generar Cotización  */}
      {showGenCotModal && genCotCliente && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowGenCotModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2><Pencil size={15}/> Generar Cotización — {genCotCliente.nombre}</h2>
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
              {/* Header columnas */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 60px 70px 90px 30px', gap: '0.4rem', marginBottom: '0.25rem' }}>
                {['Código','Descripción','Cant.','U/M','Precio',''].map((h,i) => (
                  <div key={i} style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '240px', overflowY: 'auto' }}>
                {cotItems.map((it, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 60px 70px 90px 30px', gap: '0.4rem', alignItems: 'center' }}>
                    <input type="text" value={it.codigo||''} onChange={e => actualizarItemCot(i,'codigo',e.target.value)} placeholder="000000" style={{ padding: '0.45rem 0.5rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.8rem', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--mono)' }} />
                    <input type="text" value={it.descripcion} onChange={e => actualizarItemCot(i,'descripcion',e.target.value)} placeholder="Descripción..." style={{ padding: '0.45rem 0.7rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface2)', color: 'var(--text)' }} />
                    <input type="number" value={it.cantidad} onChange={e => actualizarItemCot(i,'cantidad',e.target.value)} min="1" placeholder="1" style={{ padding: '0.45rem 0.5rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface2)', color: 'var(--text)', textAlign: 'center', fontFamily: 'var(--mono)' }} />
                    <select value={it.um||'UND'} onChange={e => actualizarItemCot(i,'um',e.target.value)} style={{ padding: '0.45rem 0.4rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.8rem', background: 'var(--surface2)', color: 'var(--text)' }}>
                      {['UND','HRS','MES','KG','LT','M2','SERV'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input type="number" value={it.precio} onChange={e => actualizarItemCot(i,'precio',e.target.value)} placeholder="0.00" style={{ padding: '0.45rem 0.5rem', border: '1px solid var(--border2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface2)', color: 'var(--text)', textAlign: 'right', fontFamily: 'var(--mono)' }} />
                    {cotItems.length > 1 && <button type="button" onClick={() => eliminarItemCot(i)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>×</button>}
                  </div>
                ))}
              </div>
              {/* Subtotales */}
              {(() => {
                const sub = cotItems.reduce((s,it) => s + (parseFloat(it.precio)||0)*(parseFloat(it.cantidad)||1), 0);
                const tax = cotConITBIS ? sub * 0.18 : 0;
                return (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--surface2)', borderRadius: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <input type="checkbox" checked={cotConITBIS} onChange={e => setCotConITBIS(e.target.checked)} />
                        Aplicar ITBIS 18%
                      </label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1.5rem', fontSize: '0.83rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Subtotal: <strong>${sub.toLocaleString('en-US',{minimumFractionDigits:2})}</strong></span>
                      {cotConITBIS && <span style={{ color: 'var(--text-muted)' }}>ITBIS 18%: <strong>${tax.toLocaleString('en-US',{minimumFractionDigits:2})}</strong></span>}
                      <span style={{ color: 'var(--navy)', fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--mono)' }}>Total: ${(sub+tax).toLocaleString('en-US',{minimumFractionDigits:2})}</span>
                    </div>
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
              <button className="btn btn-primary" onClick={generarCotizacionPDF}><FileText size={13}/> Generar y Descargar PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RESPONDER GMAIL */}
      {gmailReply && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setGmailReply(null); }}>
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h2><Mail size={15}/> Responder email</h2>
              <button className="close-btn" onClick={() => setGmailReply(null)}>×</button>
            </div>
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-2)', borderRadius: '8px', fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '0.25rem' }}>{gmailReply.subject}</div>
              <div style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>De: {gmailReply.from}</div>
              {gmailReply.snippet && <div style={{ color: 'var(--text-light)', fontSize: '0.78rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', fontStyle: 'italic', maxHeight: '80px', overflowY: 'auto' }}>{gmailReply.snippet}</div>}
            </div>
            <div className="form-group">
              <label>Tu respuesta</label>
              <textarea value={gmailReplyBody} onChange={e => setGmailReplyBody(e.target.value)} rows={6} placeholder="Escribe tu respuesta aquí..." style={{ width: '100%', resize: 'vertical' }} />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setGmailReply(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={gmailSending || !gmailReplyBody.trim()} onClick={async () => {
                setGmailSending(true);
                try {
                  const to = gmailReply.from.match(/<(.+)>/) ? gmailReply.from.match(/<(.+)>/)[1] : gmailReply.from;
                  const subject = gmailReply.subject.startsWith('Re:') ? gmailReply.subject : `Re: ${gmailReply.subject}`;
                  const res = await fetch('/api/gmail/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to, subject, body: gmailReplyBody, threadId: gmailReply.threadId }),
                  });
                  const data = await res.json();
                  if (data.ok) { showToast('Email enviado', 'success'); setGmailReply(null); }
                  else showToast(data.error || 'Error al enviar', 'error');
                } catch(e) { showToast('Error al enviar', 'error'); }
                setGmailSending(false);
              }}>
                {gmailSending ? <Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> : <Send size={13}/>} Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/*  Modal Notificar con Documento  */}
      {showNotifDocModal && notifDocCliente && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowNotifDocModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2><Send size={15}/> Notificar con Documento — {notifDocCliente.nombre}</h2>
              <button className="close-btn" onClick={() => setShowNotifDocModal(false)}>×</button>
            </div>

            {/* Selector de documento */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Seleccionar documento</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
                {(cotizaciones[notifDocCliente.id] || []).map(doc => (
                  <div key={doc.id} onClick={() => setNotifDocSeleccionado(doc)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.85rem', borderRadius: '9px', border: `2px solid ${notifDocSeleccionado?.id === doc.id ? 'var(--accent)' : 'var(--border)'}`, background: notifDocSeleccionado?.id === doc.id ? 'var(--accent-glow)' : 'var(--surface2)', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{doc.tipo === 'generado' ? <ClipboardList size={18}/> : <FileText size={18}/>}</span>
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
              <strong><ClipboardList size={13}/> ¿Cómo funciona?</strong>
              <ol style={{ marginTop: '0.35rem', paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                <li>El PDF se <strong>descargará automáticamente</strong> a tu computadora</li>
                <li>Se abrirá <strong>WhatsApp Web</strong> con el mensaje listo</li>
                <li>Solo <strong>adjunta el PDF descargado</strong> al chat y envía</li>
              </ol>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowNotifDocModal(false)}>Cancelar</button>
              <button className="btn btn-success" onClick={enviarNotifConDocumento} disabled={!notifDocSeleccionado || !notifDocCliente?.contacto}>
                <MessageSquare size={13}/> Descargar PDF y abrir WhatsApp
              </button>
            </div>
            {!notifDocCliente?.contacto && <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.5rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem' }}><AlertTriangle size={13}/> Este cliente no tiene número de contacto registrado</div>}
          </div>
        </div>
      )}

      {/* Modal Tags */}
      {showTagModal && tagClienteId && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowTagModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2><Tag size={15}/> Etiquetas — {clientes.find(c => c.id === tagClienteId)?.nombre}</h2>
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
      {/*  Settings Panel — Claude style  */}
      {showSettingsPanel && (
        <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSettingsPanel(false); }}>
          <div className="settings-panel">
            {/* Left nav */}
            <div className="settings-sidebar">
              <div className="settings-sidebar-title">Configuración</div>
              <button className={`settings-nav-item ${settingsSection === 'config' ? 'active' : ''}`} onClick={() => setSettingsSection('config')}>
                <Settings size={14}/>
                Preferencias
              </button>
              {esAdmin && (
                <button className={`settings-nav-item ${settingsSection === 'empresas' ? 'active' : ''}`} onClick={() => { setSettingsSection('empresas'); fetch('/api/empresas').then(r=>r.json()).then(setEmpresas); }}>
                  <Briefcase size={14}/>
                  Empresas
                </button>
              )}
              {esAdmin && (
                <button className={`settings-nav-item ${settingsSection === 'auditoria' ? 'active' : ''}`} onClick={() => setSettingsSection('auditoria')}>
                  <FileText size={14}/>
                  Auditoría
                </button>
              )}
              {esAdmin && (
                <button className={`settings-nav-item ${settingsSection === 'permisos' ? 'active' : ''}`} onClick={() => setSettingsSection('permisos')}>
                  <Lock size={14}/>
                  Permisos
                </button>
              )}
              {esAdmin && (
                <button className={`settings-nav-item ${settingsSection === 'activaciones' ? 'active' : ''}`} onClick={async () => { setSettingsSection('activaciones'); setLoadingActivaciones(true); const r = await fetch('/api/activaciones/admin'); if (r.ok) setActivaciones(await r.json()); setLoadingActivaciones(false); }}>
                  <Monitor size={14}/>
                  Licencias App
                </button>
              )}
              <button className="settings-nav-item" style={{ marginTop: 'auto', color: 'var(--danger)', opacity: 0.8 }} onClick={() => { window._manualLogout = true; setShowSettingsPanel(false); signOut({ callbackUrl: '/' }); setTimeout(() => { window.location.href = '/'; }, 500); }}>
                <LogOut size={14}/>
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
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)', display:'flex', alignItems:'center', gap:'0.4rem' }}><Palette size={11}/> Apariencia</div>
                  <div className="settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Palette size={18}/></div>
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
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{darkMode ? <Moon size={18}/> : <Sun size={18}/>}</div>
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
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)', display:'flex', alignItems:'center', gap:'0.4rem' }}><Bell size={11}/> Notificaciones</div>
                  <div className="settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Clock size={18}/></div>
                      <div><div className="settings-row-label">Alerta de créditos</div><div className="settings-row-desc">Alertar cuando falten N días o menos para vencer</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="number" value={recordatoriosDias} onChange={e => setRecordatoriosDias(parseInt(e.target.value) || 7)} min="1" max="30" style={{ width: '56px', padding: '0.35rem 0.5rem', border: '1px solid var(--border-2)', borderRadius: '7px', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'var(--mono)', textAlign: 'center' }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>días</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)', display:'flex', alignItems:'center', gap:'0.4rem' }}><Target size={11}/> Objetivos</div>
                  <div className="settings-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><DollarSign size={18}/></div>
                      <div><div className="settings-row-label">Meta mensual</div><div className="settings-row-desc">Objetivo de cobros del mes en curso</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>RD$</span>
                      <input type="number" value={metaMensual || ''} onChange={e => setMetaMensual(parseFloat(e.target.value) || 0)} placeholder="0" style={{ width: '100px', padding: '0.35rem 0.5rem', border: '1px solid var(--border-2)', borderRadius: '7px', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'var(--mono)' }} />
                    </div>
                  </div>
                </div>

                {/* VINCULAR GMAIL */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)', display:'flex', alignItems:'center', gap:'0.4rem' }}><Mail size={11}/> Gmail</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--surface-2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>Vincular cuenta Gmail</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Ver tus emails directamente en el sistema</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={async () => {
                        const res = await fetch('/api/gmail/auth');
                        const data = await res.json();
                        if (data.url) window.open(data.url, '_blank', 'width=500,height=600');
                      }}>
                        <Mail size={13}/> Vincular Gmail
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: '0.78rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={async () => {
                        await fetch('/api/gmail/auth', { method: 'DELETE' });
                        setGmailEmails([]);
                        setGmailUnread(0);
                        showToast('Gmail desvinculado', 'success');
                      }}>
                        Desvincular
                      </button>
                    </div>
                  </div>
                </div>

                {esAdmin && <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)', display:'flex', alignItems:'center', gap:'0.4rem' }}><FileText size={11}/> Datos de Empresa (Cotizaciones)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre Empresa</label>
                        <input type="text" value={empresaActual?.nombre || ''} onChange={e => setEmpresaActual(prev => ({...prev, nombre: e.target.value}))} placeholder="Ej: 7 LABS SRL" style={{ padding: '0.45rem 0.7rem', border: '1px solid var(--border-2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RNC</label>
                        <input type="text" value={empresaActual?.rnc || ''} onChange={e => setEmpresaActual(prev => ({...prev, rnc: e.target.value}))} placeholder="Ej: 130826986" style={{ padding: '0.45rem 0.7rem', border: '1px solid var(--border-2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dirección</label>
                      <input type="text" value={empresaActual?.direccion || ''} onChange={e => setEmpresaActual(prev => ({...prev, direccion: e.target.value}))} placeholder="Ej: CALLE C NO. 39 LAS PRADERAS" style={{ padding: '0.45rem 0.7rem', border: '1px solid var(--border-2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ciudad</label>
                        <input type="text" value={empresaActual?.ciudad || ''} onChange={e => setEmpresaActual(prev => ({...prev, ciudad: e.target.value}))} placeholder="Ej: Santo Domingo, Rep. Dom." style={{ padding: '0.45rem 0.7rem', border: '1px solid var(--border-2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teléfono</label>
                        <input type="text" value={empresaActual?.telefono || ''} onChange={e => setEmpresaActual(prev => ({...prev, telefono: e.target.value}))} placeholder="Ej: 809-722-9225" style={{ padding: '0.45rem 0.7rem', border: '1px solid var(--border-2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logo URL (imagen)</label>
                      <input type="text" value={empresaActual?.logo_url || ''} onChange={e => setEmpresaActual(prev => ({...prev, logo_url: e.target.value}))} placeholder="https://..." style={{ padding: '0.45rem 0.7rem', border: '1px solid var(--border-2)', borderRadius: '7px', fontSize: '0.82rem', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <button className="btn btn-secondary" style={{ alignSelf: 'flex-end' }} onClick={async () => {
                      if (!empresaActual?.id) return;
                      const res = await fetch('/api/empresas', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: empresaActual.id, nombre: empresaActual.nombre, direccion: empresaActual.direccion, telefono: empresaActual.telefono, rnc: empresaActual.rnc, logo_url: empresaActual.logo_url, ciudad: empresaActual.ciudad, activa: empresaActual.activa }) });
                      if (res.ok) showToast('Datos de empresa guardados', 'success');
                      else showToast('Error al guardar', 'error');
                    }}>Guardar datos empresa</button>
                  </div>
                </div>}

                <div style={{ marginTop: '0.5rem' }}>
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setShowSettingsPanel(false); showToast('Configuración guardada', 'success'); }}>Guardar cambios</button>
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
              {settingsSection === 'permisos' && esAdmin && (
                <div>
                  <div className="settings-content-header">
                    <div>
                      <div className="settings-content-title" style={{display:'flex',alignItems:'center',gap:'0.5rem'}}><Lock size={14}/> Permisos por Rol</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>El admin siempre tiene acceso completo. Los cambios se aplican de inmediato.</div>
                    </div>
                    <button className="settings-close-btn" onClick={() => setShowSettingsPanel(false)}>×</button>
                  </div>
                  <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem', minWidth: 580 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-2)' }}>
                          <th style={{ padding: '0.55rem 0.9rem', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 2, borderBottom: '2px solid var(--border)' }}>Permiso</th>
                          {ROLES_PANEL.map(r => (
                            <th key={r.key} style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>{r.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PERMISOS_LISTA.map((p, pi) => (
                          <tr key={p.key} style={{ borderBottom: '1px solid var(--border)', background: pi % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                            <td style={{ padding: '0.5rem 0.9rem', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'inherit', zIndex: 1 }}>{p.label}</td>
                            {ROLES_PANEL.map(r => {
                              const activo = permisosRol[r.key]?.[p.key] !== false;
                              return (
                                <td key={r.key} style={{ textAlign: 'center', padding: '0.4rem 0.5rem' }}>
                                  <button
                                    onClick={() => togglePermiso(r.key, p.key, activo)}
                                    title={`${activo ? 'Desactivar' : 'Activar'} "${p.label}" para ${r.label}`}
                                    style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: activo ? 'var(--accent)' : '#9ca3af', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                                  >
                                    <span style={{ position: 'absolute', top: 2, left: activo ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {settingsSection === 'empresas' && esAdmin && (<>
                <div className="settings-content-header">
                  <div className="settings-content-title">Gestión de Empresas</div>
                  <button className="settings-close-btn" onClick={() => setShowSettingsPanel(false)}>×</button>
                </div>
                {/* Crear empresa */}
                <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
                  <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:'0.75rem' }}>Nueva Empresa</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', marginBottom:'0.5rem' }}>
                    <input placeholder="Nombre (ej: Empresa A)" value={empresaForm.nombre} onChange={e => setEmpresaForm(f => ({ ...f, nombre: e.target.value }))} style={{ padding:'0.5rem 0.75rem', border:'1px solid var(--border)', borderRadius:'7px', fontSize:'0.83rem', background:'var(--surface)', color:'var(--text)' }} />
                    <input placeholder="Slug (ej: empresa-a)" value={empresaForm.slug} onChange={e => setEmpresaForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g,'-') }))} style={{ padding:'0.5rem 0.75rem', border:'1px solid var(--border)', borderRadius:'7px', fontSize:'0.83rem', background:'var(--surface)', color:'var(--text)' }} />
                  </div>
                  <button className="btn btn-primary" style={{ width:'100%' }} onClick={async () => {
                    if (!empresaForm.nombre || !empresaForm.slug) return showToast('Completa los campos', 'error');
                    const r = await fetch('/api/empresas', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-csrf-token': document.cookie.match(/csrf-token=([^;]+)/)?.[1] || '' }, body: JSON.stringify(empresaForm) });
                    if (r.ok) { const d = await r.json(); setEmpresas(prev => [...prev, d]); setEmpresaForm({ nombre:'', slug:'' }); showToast('Empresa creada', 'success'); }
                    else showToast('Error creando empresa', 'error');
                  }}>Crear Empresa</button>
                </div>
                {/* Lista de empresas */}
                <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:'0.5rem' }}>Empresas registradas</div>
                {empresas.map(emp => (
                  <div key={emp.id} style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'9px', padding:'0.75rem 1rem', marginBottom:'0.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.5rem' }}>
                    <div style={{ flex:1 }}>
                      <input defaultValue={emp.nombre} onBlur={async e => {
                        const nuevoNombre = e.target.value.trim();
                        if (!nuevoNombre || nuevoNombre === emp.nombre) return;
                        const r = await fetch('/api/empresas', { method:'PATCH', headers:{ 'Content-Type':'application/json', 'x-csrf-token': document.cookie.match(/csrf-token=([^;]+)/)?.[1] || '' }, body: JSON.stringify({ id: emp.id, nombre: nuevoNombre, activa: emp.activa }) });
                        if (r.ok) { setEmpresas(prev => prev.map(e => e.id === emp.id ? { ...e, nombre: nuevoNombre } : e)); showToast('Nombre actualizado', 'success'); }
                        else showToast('Error actualizando', 'error');
                      }} style={{ fontWeight:700, fontSize:'0.88rem', background:'transparent', border:'1px solid transparent', borderRadius:'5px', padding:'0.2rem 0.4rem', color:'var(--text)', width:'100%', cursor:'text' }} onFocus={e => e.target.style.borderColor='var(--brand)'} />
                      <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', paddingLeft:'0.4rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>/{emp.slug} · ID: {emp.id} · {emp.activa ? <><CheckCircle size={11} style={{color:'#059669'}}/> Activa</> : <><Ban size={11} style={{color:'#dc2626'}}/> Inactiva</>}</div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', alignItems:'flex-end' }}>
                      {emp.config?.logoUrl && <img src={emp.config.logoUrl} alt="logo" style={{ height:'32px', objectFit:'contain', borderRadius:'4px', marginBottom:'0.25rem' }} />}
                      <label style={{ fontSize:'0.72rem', padding:'0.25rem 0.6rem', borderRadius:'6px', border:'1px solid var(--brand)', background:'rgba(99,91,255,0.08)', color:'var(--brand)', cursor:'pointer', whiteSpace:'nowrap', fontWeight:600 }}>
                        {emp.config?.logoUrl ? <><RefreshCw size={11}/> Cambiar logo</> : <><FileText size={11}/> Subir logo</>}
                        <input type="file" accept="image/*" style={{ display:'none' }} onChange={async e => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const fd = new FormData();
                          fd.append('logo', file);
                          fd.append('empresa_id', emp.id);
                          const r = await fetch('/api/empresas/logo', { method:'POST', body: fd });
                          if (r.ok) {
                            const { logoUrl } = await r.json();
                            setEmpresas(prev => prev.map(e => e.id === emp.id ? { ...e, config: { ...e.config, logoUrl } } : e));
                            if (empresaActual?.id === emp.id) setEmpresaActual(prev => ({ ...prev, config: { ...prev.config, logoUrl } }));
                            showToast('Logo actualizado', 'success');
                          } else showToast('Error subiendo logo', 'error');
                        }} />
                      </label>
                      <button onClick={async () => {
                        const r = await fetch('/api/empresas', { method:'PATCH', headers:{ 'Content-Type':'application/json', 'x-csrf-token': document.cookie.match(/csrf-token=([^;]+)/)?.[1] || '' }, body: JSON.stringify({ id: emp.id, nombre: emp.nombre, activa: !emp.activa }) });
                        if (r.ok) { setEmpresas(prev => prev.map(e => e.id === emp.id ? { ...e, activa: !e.activa } : e)); showToast('Estado actualizado', 'success'); }
                      }} style={{ fontSize:'0.72rem', padding:'0.25rem 0.6rem', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-muted)', cursor:'pointer', whiteSpace:'nowrap' }}>
                        {emp.activa ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                ))}
                {/* Asignar usuario a empresa */}
                <div style={{ marginTop:'1rem', fontWeight:700, fontSize:'0.85rem', marginBottom:'0.5rem' }}>Asignar usuario a empresa</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:'0.5rem' }}>
                  <select id="emp-user-select" style={{ padding:'0.5rem', border:'1px solid var(--border)', borderRadius:'7px', fontSize:'0.83rem', background:'var(--surface)', color:'var(--text)' }}>
                    {Object.keys(usuarios || {}).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <select id="emp-empresa-select" style={{ padding:'0.5rem', border:'1px solid var(--border)', borderRadius:'7px', fontSize:'0.83rem', background:'var(--surface)', color:'var(--text)' }}>
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                  <button className="btn btn-primary" onClick={async () => {
                    const username = document.getElementById('emp-user-select').value;
                    const empresa_id = parseInt(document.getElementById('emp-empresa-select').value);
                    const r = await fetch('/api/empresas', { method:'PATCH', headers:{ 'Content-Type':'application/json', 'x-csrf-token': document.cookie.match(/csrf-token=([^;]+)/)?.[1] || '' }, body: JSON.stringify({ username, empresa_id }) });
                    if (r.ok) showToast(`${username} asignado a empresa`, 'success');
                    else showToast('Error', 'error');
                  }}>Asignar</button>
                </div>
              </>)}

              {/* ── Panel Licencias App (Electron) ── */}
              {settingsSection === 'activaciones' && esAdmin && (<>
                <div className="settings-content-header">
                  <div className="settings-content-title">Licencias App de Escritorio</div>
                  <button className="settings-close-btn" onClick={() => setShowSettingsPanel(false)}>×</button>
                </div>

                {/* Generar nuevo código */}
                <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
                  <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:'0.65rem', display:'flex', alignItems:'center', gap:'0.4rem' }}><Monitor size={13}/> Nuevo código de activación</div>
                  <div style={{ display:'flex', gap:'0.5rem' }}>
                    <input
                      placeholder="Nombre del agente (ej: TAULIO)"
                      value={nuevaActivNombre}
                      onChange={e => setNuevaActivNombre(e.target.value)}
                      onKeyDown={async e => { if (e.key === 'Enter') {
                        if (!nuevaActivNombre.trim()) return;
                        const r = await fetch('/api/activaciones/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nombre_agente: nuevaActivNombre.trim() }) });
                        if (r.ok) { const d = await r.json(); setActivaciones(prev => [d, ...prev]); setNuevaActivNombre(''); showToast('Código generado', 'success'); }
                        else showToast('Error generando código', 'error');
                      }}}
                      style={{ flex:1, padding:'0.5rem 0.75rem', border:'1px solid var(--border)', borderRadius:'7px', fontSize:'0.83rem', background:'var(--surface)', color:'var(--text)' }}
                    />
                    <button className="btn btn-primary" onClick={async () => {
                      if (!nuevaActivNombre.trim()) return showToast('Ingresa el nombre del agente', 'error');
                      const r = await fetch('/api/activaciones/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nombre_agente: nuevaActivNombre.trim() }) });
                      if (r.ok) { const d = await r.json(); setActivaciones(prev => [d, ...prev]); setNuevaActivNombre(''); showToast('Código generado', 'success'); }
                      else showToast('Error generando código', 'error');
                    }}>Generar</button>
                  </div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'0.4rem' }}>El código se genera automáticamente. Compártelo con el agente para activar su instalación.</div>
                </div>

                {/* Lista de licencias */}
                <div style={{ fontWeight:700, fontSize:'0.85rem', marginBottom:'0.5rem' }}>Licencias registradas</div>
                {loadingActivaciones && <div style={{ color:'var(--text-muted)', fontSize:'0.82rem', textAlign:'center', padding:'1.5rem' }}>Cargando…</div>}
                {!loadingActivaciones && activaciones.length === 0 && (
                  <div style={{ color:'var(--text-muted)', fontSize:'0.82rem', textAlign:'center', padding:'1.5rem' }}>No hay licencias creadas aún</div>
                )}
                {activaciones.map(lic => (
                  <div key={lic.id} style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'9px', padding:'0.75rem 1rem', marginBottom:'0.5rem' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'0.5rem' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.2rem' }}>
                          <span style={{ fontWeight:700, fontSize:'0.88rem' }}>{lic.nombre_agente}</span>
                          <span style={{ fontSize:'0.7rem', padding:'0.15rem 0.5rem', borderRadius:'20px', fontWeight:600,
                            background: lic.activo ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                            color: lic.activo ? '#4ade80' : '#f87171',
                            border: `1px solid ${lic.activo ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
                            {lic.activo ? 'Activa' : 'Desactivada'}
                          </span>
                        </div>
                        <div style={{ fontFamily:'monospace', fontSize:'0.9rem', letterSpacing:'0.1em', color:'var(--brand)', fontWeight:600, marginBottom:'0.3rem' }}>{lic.codigo}</div>
                        <div style={{ fontSize:'0.71rem', color:'var(--text-muted)' }}>
                          {lic.device_id
                            ? <><Monitor size={10}/> Activado el {lic.fecha_activacion ? new Date(lic.fecha_activacion).toLocaleDateString('es-DO') : '—'}</>
                            : 'Sin activar (ningún dispositivo vinculado)'}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem', alignItems:'flex-end', flexShrink:0 }}>
                        <button onClick={async () => {
                          const r = await fetch('/api/activaciones/admin', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: lic.id, activo: !lic.activo }) });
                          if (r.ok) { const d = await r.json(); setActivaciones(prev => prev.map(a => a.id === lic.id ? d : a)); showToast(d.activo ? 'Licencia activada' : 'Licencia desactivada', 'success'); }
                        }} style={{ fontSize:'0.72rem', padding:'0.25rem 0.65rem', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-muted)', cursor:'pointer', whiteSpace:'nowrap', fontWeight:600 }}>
                          {lic.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        {lic.device_id && (
                          <button onClick={async () => {
                            if (!confirm('¿Liberar dispositivo? El agente deberá activar de nuevo en su PC.')) return;
                            const r = await fetch('/api/activaciones/admin', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: lic.id, release_device: true }) });
                            if (r.ok) { const d = await r.json(); setActivaciones(prev => prev.map(a => a.id === lic.id ? d : a)); showToast('Dispositivo liberado', 'success'); }
                          }} style={{ fontSize:'0.72rem', padding:'0.25rem 0.65rem', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text-muted)', cursor:'pointer', whiteSpace:'nowrap' }}>
                            Liberar PC
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </>)}
            </div>
          </div>
        </div>
      )}

      {/*  Modal Gestión de Usuarios  */}
      {showUsuariosModal && esAdmin && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) { setShowUsuariosModal(false); setUsuarioEditando(null); setUsuarioForm({ username:'', nombre:'', pass:'', rol:'viewer' }); } }}>
          <div className="modal-content" style={{ maxWidth: '620px' }}>
            <div className="modal-header" style={{ borderBottom:'1px solid var(--border)', paddingBottom:'1rem', marginBottom:'1.25rem' }}>
              <div>
                <h2 style={{ fontSize:'1.1rem', fontWeight:700, margin:0, display:'flex', alignItems:'center', gap:'0.6rem' }}>
                  <Users size={18}/>
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
                    <button type="button" onClick={() => setShowPassActual(v => !v)} style={{ position:'absolute', right:'0.5rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}>
                      {showPassActual ? <EyeOff size={16}/> : <Eye size={16}/>}
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
                  {usuarioEditando ? <><Save size={13}/> Actualizar usuario</> : <><Plus size={13}/> Crear usuario</>}
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
                    <button onClick={() => editarUsuario(key)} style={{ padding:'0.25rem 0.6rem', border:'1px solid var(--border2)', borderRadius:'6px', background:'var(--surface2)', cursor:'pointer' }}><Pencil size={13}/></button>
                    {key !== currentUser && (
                      <button onClick={() => eliminarUsuario(key)} style={{ padding:'0.25rem 0.6rem', border:'1px solid #fca5a5', borderRadius:'6px', background:'#fee2e2', color:'#dc2626', cursor:'pointer' }}><Trash2 size={13}/></button>
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
              <div style={{ marginTop:'0.5rem', color:'#059669', fontWeight:600, display:'flex', alignItems:'center', gap:'0.4rem' }}><CheckCircle size={14}/> Los usuarios se guardan en el servidor — cualquier computadora puede acceder con sus credenciales.</div>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => { setShowUsuariosModal(false); setUsuarioEditando(null); setUsuarioForm({ username:'', nombre:'', pass:'', rol:'viewer' }); }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/*  Modal Auditoría de Seguridad  */}
      {showAuditModal && esAdmin && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowAuditModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '820px' }}>
            <div className="modal-header">
              <h2><Search size={15}/> Bitácora de Seguridad</h2>
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
              <button onClick={abrirAuditLog} className="btn btn-secondary" style={{ whiteSpace:'nowrap' }}><RefreshCw size={13}/> Actualizar</button>
              <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                {auditLoading ? 'Cargando...' : `${auditEntries.length} registros`}
              </span>
            </div>

            {/* Leyenda */}
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.75rem', fontSize:'0.68rem' }}>
              {[
                { ico: <CheckCircle size={11}/>, lbl:'Login OK', bg:'#dcfce7', col:'#15803d' },
                { ico: <XCircle size={11}/>, lbl:'Login Fail', bg:'#fee2e2', col:'#dc2626' },
                { ico: <Plus size={11}/>, lbl:'Creado', bg:'#eff6ff', col:'#1d4ed8' },
                { ico: <Pencil size={11}/>, lbl:'Actualizado', bg:'#fef9c3', col:'#92400e' },
                { ico: <Trash2 size={11}/>, lbl:'Eliminado', bg:'#fce7f3', col:'#be185d' },
                { ico: <Ban size={11}/>, lbl:'Acceso Denegado', bg:'#fef2f2', col:'#991b1b' },
                { ico: <Ban size={11}/>, lbl:'CSRF', bg:'#fef2f2', col:'#7f1d1d' },
                { ico: <Clock size={11}/>, lbl:'Rate Limit', bg:'#fff7ed', col:'#c2410c' },
              ].map(({ ico, lbl, bg, col }) => (
                <span key={lbl} style={{ background:bg, color:col, padding:'0.15rem 0.45rem', borderRadius:'6px', fontWeight:600, display:'inline-flex', alignItems:'center', gap:'0.25rem' }}>{ico} {lbl}</span>
              ))}
            </div>

            {/* Lista de eventos */}
            <div style={{ maxHeight:'420px', overflowY:'auto', fontFamily:'monospace', fontSize:'0.73rem', background:'#0f172a', borderRadius:'10px', padding:'0.75rem', color:'#e2e8f0' }}>
              {auditLoading && <div style={{ textAlign:'center', color:'#94a3b8', padding:'2rem' }}>Cargando registros...</div>}
              {!auditLoading && auditError && (
                <div style={{ textAlign:'center', color:'#fca5a5', padding:'2rem' }}>
                  <XCircle size={20} style={{ display:'block', margin:'0 auto 0.5rem', opacity:0.7 }}/>
                  {auditError}
                  <div style={{ marginTop:'0.5rem', fontSize:'0.7rem', color:'#64748b' }}>Haz clic en "Actualizar" para reintentar.</div>
                </div>
              )}
              {!auditLoading && !auditError && auditEntries.length === 0 && (
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
              <strong style={{display:'inline-flex',alignItems:'center',gap:'0.3rem'}}><Lock size={12}/> Información:</strong> Estos registros son de solo lectura. Cada acción queda registrada con fecha, hora, usuario e IP.
              El archivo <code>data/audit.log</code> se guarda en el servidor y no puede ser alterado desde el sistema.
            </div>

            <div className="form-actions" style={{ marginTop:'0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowAuditModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/*  Modal Bitácora de Gestión  */}
      {showGestionModal && gestionClienteId && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowGestionModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2><Phone size={15}/> Registrar Gestión — {clientes.find(c=>c.id===gestionClienteId)?.nombre}</h2>
              <button className="close-btn" onClick={() => setShowGestionModal(false)}>×</button>
            </div>

            {/* Historial reciente */}
            {(gestiones[gestionClienteId]||[]).length > 0 && (
              <div style={{ marginBottom:'1rem', maxHeight:'150px', overflowY:'auto' }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'0.4rem' }}>Historial reciente</div>
                {(gestiones[gestionClienteId]||[]).slice(0,5).map(g => (
                  <div key={g.id} style={{ display:'flex', gap:'0.6rem', alignItems:'flex-start', padding:'0.45rem 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ color:'var(--text-muted)' }}>{g.tipo==='Llamada'?<Phone size={14}/>:g.tipo==='WhatsApp'?<MessageCircle size={14}/>:g.tipo==='Visita'?<MapPin size={14}/>:g.tipo==='Email'?<Mail size={14}/>:<Pin size={14}/>}</span>
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
              <label style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><Calendar size={13}/> Próximo seguimiento (opcional)</label>
              <input type="date" value={gestionProximaFecha} onChange={e => setGestionProximaFecha(e.target.value)} min={new Date().toISOString().split('T')[0]} />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowGestionModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarGestion}><CheckCircle size={13}/> Guardar Gestión</button>
            </div>
          </div>
        </div>
      )}

      {/*  Modal WhatsApp Masivo  */}
      {showWaMasivoModal && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget && !waMasivoActivo) { setShowWaMasivoModal(false); } }}>
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h2><Phone size={15}/> WhatsApp Masivo — {clientesSeleccionados.length} clientes</h2>
              <button className="close-btn" onClick={() => !waMasivoActivo && setShowWaMasivoModal(false)}>×</button>
            </div>

            {/* Clientes destino */}
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'0.4rem' }}>Destinatarios</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', maxHeight:'80px', overflowY:'auto' }}>
                {clientes.filter(c => clientesSeleccionados.includes(c.id)).map(c => (
                  <span key={c.id} style={{ background: c.contacto ? '#f0fdf4' : '#fef2f2', border:`1px solid ${c.contacto ? '#86efac' : '#fca5a5'}`, borderRadius:'20px', padding:'0.15rem 0.6rem', fontSize:'0.75rem', fontWeight:600, color: c.contacto ? '#15803d' : '#dc2626' }}>
                    {c.nombre}{!c.contacto ? <AlertTriangle size={11} style={{marginLeft:'0.25rem'}}/> : null}
                  </span>
                ))}
              </div>
              {clientes.filter(c => clientesSeleccionados.includes(c.id) && !c.contacto).length > 0 && (
                <div style={{ fontSize:'0.72rem', color:'#dc2626', marginTop:'0.3rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><AlertTriangle size={12}/> Los clientes en rojo no tienen número y serán omitidos</div>
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

            {!waMasivoActivo && (
              <div className="form-group">
                <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span>Vista previa del mensaje</span>
                  <button onClick={() => { const primer = clientes.find(c => clientesSeleccionados.includes(c.id)); setWaMasivoMensaje(primer ? getMsgFactura(primer) : ''); }} style={{ fontSize:'0.72rem', padding:'0.2rem 0.6rem', borderRadius:'6px', border:'1px solid var(--brand)', background:'rgba(99,91,255,0.08)', color:'var(--brand)', cursor:'pointer', fontWeight:600 }}>
                    Usar plantilla de factura
                  </button>
                </label>
                <textarea value={waMasivoMensaje} onChange={e => setWaMasivoMensaje(e.target.value)} rows={5} placeholder="Haz clic en 'Usar plantilla de factura' o escribe un mensaje..." style={{ fontFamily:'var(--mono)', fontSize:'0.78rem' }} />
              </div>
            )}

            {/* Cola activa — modo guiado */}
            {waMasivoActivo && waMasivoDestinosActual.length > 0 && (
              <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'1rem', marginBottom:'1rem' }}>
                {/* Progreso */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.6rem' }}>
                  <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', fontWeight:600 }}>Progreso</span>
                  <span style={{ fontSize:'0.82rem', fontWeight:700 }}>{waMasivoIndex + 1} / {waMasivoDestinosActual.length}</span>
                </div>
                <div style={{ height:'6px', background:'var(--border)', borderRadius:'4px', marginBottom:'0.9rem' }}>
                  <div style={{ height:'6px', background:'#25d366', borderRadius:'4px', width:`${((waMasivoIndex + 1) / waMasivoDestinosActual.length) * 100}%`, transition:'width 0.3s' }}></div>
                </div>
                {/* Cliente actual */}
                <div style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:'0.2rem' }}>{waMasivoDestinosActual[waMasivoIndex]?.nombre}</div>
                <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'0.75rem', fontFamily:'var(--mono)' }}>{waMasivoDestinosActual[waMasivoIndex]?.contacto}</div>
                {waMasivoListoSiguiente ? (
                  <button onClick={siguienteWaMasivo} style={{ width:'100%', padding:'0.65rem', background:'#25d366', color:'white', border:'none', borderRadius:'9px', fontWeight:700, fontSize:'0.9rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
                    <CheckCircle size={15}/> Enviado — {waMasivoIndex + 1 < waMasivoDestinosActual.length ? `Siguiente: ${waMasivoDestinosActual[waMasivoIndex + 1]?.nombre}` : 'Finalizar'}
                  </button>
                ) : (
                  <div style={{ textAlign:'center', fontSize:'0.82rem', color:'var(--text-muted)' }}>Abriendo WhatsApp...</div>
                )}
              </div>
            )}

            {!waMasivoActivo && (
              <>
                <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'9px', padding:'0.65rem 0.9rem', marginBottom:'1rem', fontSize:'0.78rem', color:'#78350f', display:'flex', alignItems:'flex-start', gap:'0.4rem' }}>
                  <Info size={14} style={{flexShrink:0,marginTop:'0.1rem'}}/> Se abrirá WhatsApp uno por uno. Después de enviar cada mensaje haz clic en <strong>Enviado — Siguiente</strong> para avanzar. Cada cliente se marcará como Notificado automáticamente.
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowWaMasivoModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" style={{ background:'#25d366' }} onClick={enviarWaMasivo}>
                    <MessageCircle size={13}/> Iniciar — {clientes.filter(c => clientesSeleccionados.includes(c.id) && c.contacto).length} clientes
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/*  Modal Plantillas WhatsApp  */}
      {showPlantillasModal && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowPlantillasModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <h2><MessageCircle size={15}/> Plantillas de WhatsApp</h2>
              <button className="close-btn" onClick={() => setShowPlantillasModal(false)}>×</button>
            </div>

            {/* Editor */}
            <div style={{ background:'var(--surface2)', borderRadius:'12px', padding:'1rem', marginBottom:'1rem', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'0.5rem', display:'flex', alignItems:'center', gap:'0.35rem' }}>{plantillaEditando ? <><Pencil size={11}/> Editando plantilla</> : <><Plus size={11}/> Nueva plantilla</>}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'0.5rem', marginBottom:'0.5rem' }}>
                <input type="text" value={plantillaForm.nombre} onChange={e => setPlantillaForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre de la plantilla" style={{ padding:'0.5rem 0.7rem', border:'1px solid var(--border2)', borderRadius:'7px', background:'var(--surface)', color:'var(--text)', fontSize:'0.83rem', fontFamily:'Plus Jakarta Sans, sans-serif' }} />
                <input type="text" value={plantillaForm.texto} onChange={e => setPlantillaForm(p=>({...p,texto:e.target.value}))} placeholder="Texto… usa {nombre}, {monto}, {estado}" style={{ padding:'0.5rem 0.7rem', border:'1px solid var(--border2)', borderRadius:'7px', background:'var(--surface)', color:'var(--text)', fontSize:'0.83rem', fontFamily:'Plus Jakarta Sans, sans-serif' }} />
              </div>
              <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
                {plantillaEditando && <button className="btn btn-secondary" onClick={() => { setPlantillaEditando(null); setPlantillaForm({nombre:'',texto:''}); }}>Cancelar</button>}
                <button className="btn btn-primary" onClick={guardarPlantilla} disabled={!plantillaForm.nombre.trim() || !plantillaForm.texto.trim()}>{plantillaEditando ? <><Save size={13}/> Actualizar</> : <><Plus size={13}/> Agregar</>}</button>
              </div>
            </div>

            {/* Lista de plantillas */}
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', maxHeight:'340px', overflowY:'auto' }}>
              {plantillas.map(p => (
                <div key={p.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', padding:'0.75rem 1rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.3rem' }}>
                    <span style={{ fontWeight:700, fontSize:'0.88rem' }}>{p.nombre}</span>
                    <div style={{ display:'flex', gap:'0.35rem' }}>
                      <button onClick={() => { setPlantillaEditando(p.id); setPlantillaForm({nombre:p.nombre,texto:p.texto}); }} style={{ padding:'0.2rem 0.55rem', border:'1px solid var(--border2)', borderRadius:'6px', background:'var(--surface2)', cursor:'pointer' }}><Pencil size={13}/></button>
                      <button onClick={() => eliminarPlantilla(p.id)} style={{ padding:'0.2rem 0.55rem', border:'1px solid #fca5a5', borderRadius:'6px', background:'#fee2e2', color:'#dc2626', cursor:'pointer' }}><Trash2 size={13}/></button>
                    </div>
                  </div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', lineHeight:1.5 }}>{p.texto}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:'0.75rem', fontSize:'0.73rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'0.35rem' }}>
              <Info size={13}/> Variables: <code>{'{nombre}'}</code> <code>{'{monto}'}</code> <code>{'{estado}'}</code> — se reemplazan automáticamente por los datos del cliente
            </div>
            <div className="form-actions"><button className="btn btn-secondary" onClick={() => setShowPlantillasModal(false)}>Cerrar</button></div>
          </div>
        </div>
      )}

      {/* Modal Buscador de Documentos */}
      {showBuscadorDocsModal && (() => {
        const todosLosDocs = [];
        Object.entries(cotizaciones).forEach(([cid, docs]) => {
          const cliente = datosActuales.clientes.find(c => c.id === parseInt(cid));
          docs.forEach(doc => todosLosDocs.push({ ...doc, clienteId: parseInt(cid), clienteNombre: cliente?.nombre || `#${cid}` }));
        });
        const term = busquedaDocsGlobal.trim().toLowerCase();
        const filtrados = term
          ? todosLosDocs.filter(d => (d.nombre || '').toLowerCase().includes(term) || (d.clienteNombre || '').toLowerCase().includes(term))
          : todosLosDocs;
        filtrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        return (
          <div className="modal show" onClick={e => { if (e.target === e.currentTarget) { setShowBuscadorDocsModal(false); setBusquedaDocsGlobal(''); setVincularSelects({}); } }}>
            <div className="modal-content" style={{ maxWidth: '780px', width: '96vw', padding: 0, borderRadius: '16px', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: 'linear-gradient(135deg, #1e2d4a, #2d4170)', padding: '1.25rem 1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FileText size={15}/> Todos los Documentos</h2>
                  <div style={{ fontSize: '0.75rem', color: '#93c5fd', marginTop: '0.2rem' }}>{todosLosDocs.length} documentos subidos en total</div>
                </div>
                <button onClick={() => { setShowBuscadorDocsModal(false); setBusquedaDocsGlobal(''); setVincularSelects({}); }} style={{ color: '#fff', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16}/></button>
              </div>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                  <input
                    type="text"
                    value={busquedaDocsGlobal}
                    onChange={e => setBusquedaDocsGlobal(e.target.value)}
                    placeholder="Buscar por nombre de documento o cliente…"
                    style={{ width: '100%', padding: '0.6rem 0.9rem 0.6rem 2.2rem', borderRadius: '8px', border: '1.5px solid var(--border2)', fontSize: '0.88rem', background: 'var(--surface2)', boxSizing: 'border-box' }}
                    autoFocus
                  />
                </div>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filtrados.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No se encontraron documentos.</div>
                ) : filtrados.map(doc => {
                  const nuevoId = vincularSelects[doc.id];
                  return (
                    <div key={doc.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }}/>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text)' }}>{doc.nombre || 'Sin nombre'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span>Cliente: <b style={{ color: 'var(--text)' }}>{doc.clienteNombre}</b></span>
                          {doc.monto ? <span>Monto: <b>${parseFloat(doc.monto).toLocaleString('en-US')}</b></span> : null}
                          {doc.fecha ? <span>{new Date(doc.fecha).toLocaleDateString('es-DO')}</span> : null}
                        </div>
                      </div>
                      {esAdmin && (
                        <>
                          <select
                            value={nuevoId || ''}
                            onChange={e => setVincularSelects(prev => ({ ...prev, [doc.id]: e.target.value ? parseInt(e.target.value) : null }))}
                            style={{ padding: '0.4rem 0.6rem', borderRadius: '7px', border: '1.5px solid var(--border2)', fontSize: '0.8rem', background: 'var(--surface)', minWidth: '160px' }}
                          >
                            <option value="">— Cambiar cliente —</option>
                            {datosActuales.clientes.map(c => (
                              <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => vincularDocumento(doc, nuevoId)}
                            disabled={!nuevoId || vincularLoading === doc.id}
                            style={{ padding: '0.4rem 0.9rem', background: nuevoId ? 'var(--accent)' : 'var(--border)', color: nuevoId ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.78rem', cursor: nuevoId ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                          >
                            {vincularLoading === doc.id ? '…' : 'Vincular'}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/*  Modal Carga Masiva  */}
      {showCargaMasivaModal && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) { setShowCargaMasivaModal(false); setArchivosEnProceso([]); } }}>
          <div className="modal-content" style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <h2><FolderOpen size={15}/> Carga Masiva de Documentos</h2>
              <button className="close-btn" onClick={() => { setShowCargaMasivaModal(false); setArchivosEnProceso([]); setBusquedaVincular(''); setTabCargaMasiva('subir'); }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: '1.25rem' }}>
              {[{ key: 'subir', label: 'Subir PDFs' }].map(t => (
                <button key={t.key} onClick={() => setTabCargaMasiva(t.key)} style={{ padding: '0.55rem 1.2rem', fontWeight: 700, fontSize: '0.85rem', border: 'none', borderBottom: tabCargaMasiva === t.key ? '2px solid var(--accent)' : '2px solid transparent', background: 'transparent', color: tabCargaMasiva === t.key ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', marginBottom: '-2px' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {tabCargaMasiva === 'vincular' ? (
              /* ── Tab Vincular existentes ── */
              <div>
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Busca un documento ya subido por nombre y vincúlalo al cliente correcto.</p>
                <input
                  type="text"
                  value={busquedaVincular}
                  onChange={e => setBusquedaVincular(e.target.value)}
                  placeholder="Escribe el nombre del documento…"
                  style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1.5px solid var(--border2)', fontSize: '0.9rem', marginBottom: '1rem', boxSizing: 'border-box', background: 'var(--surface2)' }}
                  autoFocus
                />
                {busquedaVincular.trim() && (() => {
                  const term = busquedaVincular.toLowerCase();
                  const resultados = [];
                  Object.entries(cotizaciones).forEach(([cid, docs]) => {
                    docs.forEach(doc => {
                      if (doc.nombre && doc.nombre.toLowerCase().includes(term)) {
                        resultados.push({ ...doc, clienteId: parseInt(cid) });
                      }
                    });
                  });
                  if (resultados.length === 0) return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No se encontraron documentos con ese nombre.</div>;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '380px', overflowY: 'auto' }}>
                      {resultados.slice(0, 30).map(doc => {
                        const clienteActual = datosActuales.clientes.find(c => c.id === doc.clienteId);
                        const nuevoId = vincularSelects[doc.id];
                        return (
                          <div key={doc.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: '180px' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text)' }}>{doc.nombre}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Cliente actual: <b>{clienteActual?.nombre || `#${doc.clienteId}`}</b>
                                {doc.monto ? ` · $${parseFloat(doc.monto).toLocaleString('en-US')}` : ''}
                              </div>
                            </div>
                            <select
                              value={nuevoId || ''}
                              onChange={e => setVincularSelects(prev => ({ ...prev, [doc.id]: e.target.value ? parseInt(e.target.value) : null }))}
                              style={{ padding: '0.4rem 0.6rem', borderRadius: '7px', border: '1.5px solid var(--border2)', fontSize: '0.8rem', background: 'var(--surface)', minWidth: '160px' }}
                            >
                              <option value="">— Cambiar cliente —</option>
                              {datosActuales.clientes.map(c => (
                                <option key={c.id} value={c.id}>{c.nombre}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => vincularDocumento(doc, nuevoId)}
                              disabled={!nuevoId || vincularLoading === doc.id}
                              style={{ padding: '0.4rem 0.9rem', background: nuevoId ? 'var(--accent)' : 'var(--border)', color: nuevoId ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.78rem', cursor: nuevoId ? 'pointer' : 'not-allowed' }}
                            >
                              {vincularLoading === doc.id ? '…' : 'Vincular'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            ) : archivosEnProceso.length === 0 ? (
              /* ── Zona de carga ── */
              <div>
               {typeof window !== 'undefined' && window.electronAPI?.isElectron && (
  <button
    type="button"
    onClick={async () => {
      const result = await window.electronAPI.seleccionarCarpetaPDFs();
      if (result.cancelado) return;
      if (!result.ok) { showToast(result.error || 'Error al leer la carpeta', 'error'); return; }
      showToast(`${result.totalArchivos} PDFs encontrados en la carpeta`, 'info');
      await procesarArchivosMasivos(
        result.pdfs
          .filter(p => p.base64)
          .map(p => {
            const byteStr = atob(p.base64.split(',')[1]);
            const bytes = new Uint8Array(byteStr.length);
            for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
            return new File([bytes], p.nombre, { type: 'application/pdf' });
          })
      );
    }}
    style={{ width:'100%', padding:'0.85rem', background:'#1e2d4a', color:'white', border:'none', borderRadius:'12px', fontWeight:700, fontSize:'0.92rem', cursor:'pointer', marginBottom:'1rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}
  >
    <FolderOpen size={18}/> Seleccionar carpeta del mes
  </button>
)}
<label
                  style={{ display: 'block', border: '2px dashed var(--border2)', borderRadius: '14px', padding: '2.5rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--surface2)' }}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-glow)'; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--surface2)'; procesarArchivosMasivos(e.dataTransfer.files); }}
                >
                  <div style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}><FolderOpen size={40}/></div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)', marginBottom: '0.35rem' }}>Arrastra los PDFs aquí o haz clic para seleccionar</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Hasta 200 archivos · Máx. 3MB por archivo · Solo .pdf</div>
                  <input type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={e => { procesarArchivosMasivos(e.target.files); e.target.value = ''; }} />
                  <span className="btn btn-primary" style={{ pointerEvents: 'none', fontSize: '0.85rem' }}>Seleccionar archivos</span>
                </label>
                {cargaMasivaProcesando && (
                  <div style={{ textAlign: 'center', marginTop: '1.25rem', color: 'var(--text-muted)', fontSize: '0.88rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}><Loader2 size={14}/> Procesando archivos, un momento...</div>
                )}
                <div style={{ marginTop: '1.25rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '0.85rem 1.1rem', fontSize: '0.8rem', color: '#15803d' }}>
                  <strong style={{display:'inline-flex',alignItems:'center',gap:'0.3rem'}}><Info size={13}/> ¿Cómo funciona la detección automática?</strong>
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
                    { label: 'Vinculados', count: archivosEnProceso.filter(a => a.estado === 'vinculado').length, color: '#059669', bg: '#f0fdf4', border: '#86efac', icon: <CheckCircle size={12}/> },
                    { label: 'Sugeridos', count: archivosEnProceso.filter(a => a.estado === 'sugerido').length, color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: <AlertTriangle size={12}/> },
                    { label: 'Sin vincular', count: archivosEnProceso.filter(a => a.estado === 'sin-vincular').length, color: '#6b7280', bg: 'var(--surface2)', border: 'var(--border)', icon: <HelpCircle size={12}/> },
                    { label: 'Ya con documento', count: archivosEnProceso.filter(a => a.estado === 'ya-tiene-doc').length, color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: <Archive size={12}/> },
                    { label: 'Errores', count: archivosEnProceso.filter(a => a.estado === 'error').length, color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: <XCircle size={12}/> },
                  ].filter(b => b.count > 0).map(b => (
                    <span key={b.label} style={{ background: b.bg, border: `1px solid ${b.border}`, padding: '0.3rem 0.85rem', borderRadius: '20px', fontSize: '0.77rem', fontWeight: 700, color: b.color, display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>
                      {b.icon} {b.label}: {b.count}
                    </span>
                  ))}
                  {archivosEnProceso.filter(a => a.montoDetectado).length > 0 && (
                    <span style={{ background: '#e0f2fe', border: '1px solid #bae6fd', padding: '0.3rem 0.85rem', borderRadius: '20px', fontSize: '0.77rem', fontWeight: 700, color: '#0369a1', display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>
                      <DollarSign size={12}/> Con monto: {archivosEnProceso.filter(a => a.montoDetectado).length}
                    </span>
                  )}
                  <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.3rem 0.85rem', borderRadius: '20px', fontSize: '0.77rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Total: {archivosEnProceso.length}
                  </span>
                </div>

                {/* Tabla de archivos */}
                <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.2rem' }}>
                  {archivosEnProceso.map((arch, idx) => (
                    <div key={arch.id || idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.65rem 0.9rem', background: arch.estado === 'vinculado' ? '#f0fdf4' : arch.estado === 'sugerido' ? '#fffbeb' : arch.estado === 'error' ? '#fef2f2' : arch.estado === 'ya-tiene-doc' ? '#f5f3ff' : 'var(--surface2)', borderRadius: '9px', border: `1px solid ${arch.estado === 'vinculado' ? '#86efac' : arch.estado === 'sugerido' ? '#fde68a' : arch.estado === 'error' ? '#fca5a5' : arch.estado === 'ya-tiene-doc' ? '#c4b5fd' : 'var(--border)'}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                          <span style={{ flexShrink: 0 }}>
                            {arch.estado === 'vinculado' ? <CheckCircle size={14} style={{color:'#059669'}}/> : arch.estado === 'sugerido' ? <AlertTriangle size={14} style={{color:'#d97706'}}/> : arch.estado === 'error' ? <XCircle size={14} style={{color:'#dc2626'}}/> : arch.estado === 'ya-tiene-doc' ? <Archive size={14} style={{color:'#7c3aed'}}/> : <HelpCircle size={14} style={{color:'#6b7280'}}/>}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{arch.nombre}</span>
                        </div>
                        {arch.estado === 'error' ? (
                          <div style={{ fontSize: '0.72rem', color: '#dc2626', paddingLeft: '1.35rem' }}>{arch.error}</div>
                        ) : arch.estado === 'ya-tiene-doc' ? (
                          <div style={{ fontSize: '0.72rem', color: '#7c3aed', paddingLeft: '1.35rem', fontWeight: 600 }}>
                            {arch.clienteAsignado?.nombre || arch.clienteDetectado?.razon || 'Cliente detectado'} — ya tiene documento, será omitido
                          </div>
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
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '20px', padding: '0.1rem 0.5rem', display:'inline-flex', alignItems:'center', gap:'0.2rem' }}>
                                <DollarSign size={11}/> RD${arch.montoDetectado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>sin monto</span>
                            )}
                          </div>
                        )}
                      </div>
                      {arch.estado !== 'error' && arch.estado !== 'ya-tiene-doc' && (
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

                <div style={{ marginTop: '0.6rem', fontSize: '0.73rem', color: 'var(--text-muted)', display:'flex', alignItems:'center', gap:'0.35rem' }}>
                  <Info size={13}/> Usa el menú desplegable para asignar o corregir manualmente el cliente de cada archivo
                </div>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => { setShowCargaMasivaModal(false); setArchivosEnProceso([]); setBusquedaVincular(''); setTabCargaMasiva('subir'); }}>Cerrar</button>
              {tabCargaMasiva === 'subir' && archivosEnProceso.length > 0 && (
                <button className="btn btn-secondary" onClick={() => setArchivosEnProceso([])}><RefreshCw size={13}/> Seleccionar otros archivos</button>
              )}
              {tabCargaMasiva === 'subir' && archivosEnProceso.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={confirmarCargaMasiva}
                  disabled={archivosEnProceso.every(a => !a.clienteAsignado || !a.base64)}
                >
                  <Save size={13}/> Guardar {archivosEnProceso.filter(a => a.clienteAsignado && a.base64).length} documento{archivosEnProceso.filter(a => a.clienteAsignado && a.base64).length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Generación Masiva de Cotizaciones */}
      {showGenMasivaModal && (
        <div className="modal-overlay" onClick={e => { if (!genMasivaActivo && e.target === e.currentTarget) setShowGenMasivaModal(false); }}>
          <div className="modal-content" style={{ maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2><Rocket size={15}/> Generación Masiva de Cotizaciones</h2>
              {!genMasivaActivo && <button className="modal-close" onClick={() => setShowGenMasivaModal(false)}><X size={16}/></button>}
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
              {/* Estado inicial — antes de empezar */}
              {!genMasivaActivo && genMasivaProgreso.total === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <Rocket size={40} style={{ color: 'var(--primary)', marginBottom: '0.75rem' }}/>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)', marginBottom: '0.3rem' }}>
                    {clientes.filter(c => COT_PLANTILLAS[c.id]).length} clientes listos para generar
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    {Object.keys(COT_PLANTILLAS).length} plantillas cargadas desde el Excel
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: '380px', margin: '0 auto 1.5rem' }}>
                    Se generará una cotización PDF por cada cliente con sus conceptos, cantidades y precios del Excel. Se guardan automáticamente, sin necesidad de descargarlas una a una.
                  </div>
                  {clientes.filter(c => COT_PLANTILLAS[c.id]).length === 0 ? (
                    <div style={{ color: '#d97706', fontSize: '0.85rem', display:'flex', alignItems:'center', gap:'0.4rem', justifyContent:'center' }}>
                      <AlertTriangle size={14}/> Cargando clientes... Intenta de nuevo en un momento.
                    </div>
                  ) : (
                    <button className="btn btn-primary" onClick={iniciarGenMasiva} style={{ fontSize: '0.9rem', padding: '0.6rem 1.5rem' }}>
                      <Rocket size={14}/> Iniciar generación ({clientes.filter(c => COT_PLANTILLAS[c.id]).length})
                    </button>
                  )}
                </div>
              )}

              {/* En progreso */}
              {(genMasivaActivo || genMasivaProgreso.total > 0) && (
                <div>
                  {/* Barra de progreso */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      <span>{genMasivaActivo ? 'Generando...' : 'Completado'}</span>
                      <span>{genMasivaProgreso.done} / {genMasivaProgreso.total}</span>
                    </div>
                    <div style={{ background: 'var(--border)', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '8px', background: 'var(--primary)', width: `${genMasivaProgreso.total > 0 ? Math.round(genMasivaProgreso.done / genMasivaProgreso.total * 100) : 0}%`, transition: 'width 0.3s ease' }}/>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.78rem' }}>
                      <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle size={12}/> {genMasivaProgreso.ok} generadas</span>
                      {genMasivaProgreso.error > 0 && <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><XCircle size={12}/> {genMasivaProgreso.error} errores</span>}
                      {genMasivaActivo && <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }}/> procesando...</span>}
                    </div>
                  </div>

                  {/* Log de resultados */}
                  <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {genMasivaLog.map((entry, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.7rem', borderRadius: '7px', background: entry.estado === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${entry.estado === 'ok' ? '#86efac' : '#fca5a5'}`, fontSize: '0.78rem' }}>
                        {entry.estado === 'ok' ? <CheckCircle size={13} style={{ color: '#059669', flexShrink: 0 }}/> : <XCircle size={13} style={{ color: '#dc2626', flexShrink: 0 }}/>}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{entry.cliente}</span>
                        {entry.estado === 'ok' && <span style={{ fontWeight: 700, color: '#059669', flexShrink: 0 }}>RD${(entry.monto||0).toLocaleString('en-US',{minimumFractionDigits:2})}</span>}
                        {entry.estado === 'error' && <span style={{ color: '#dc2626', flexShrink: 0 }}>{entry.msg}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!genMasivaActivo && genMasivaProgreso.done > 0 && (
              <div className="form-actions" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-secondary" onClick={() => setShowGenMasivaModal(false)}>Cerrar</button>
                <button className="btn btn-primary" onClick={() => { setGenMasivaLog([]); setGenMasivaProgreso({ total:0, done:0, ok:0, error:0 }); iniciarGenMasiva(); }}>
                  <RefreshCw size={13}/> Regenerar
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Modal de nueva versión — actualización automática */}
      {nuevaVersion && (
        <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(6px)' }}>
          <div className="modal-content" style={{ maxWidth: '380px', textAlign: 'center', padding: '2.5rem 2rem' }}>
            <Rocket size={56} style={{ color:'var(--brand)', marginBottom:'1rem' }}/>
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
      {/* MODAL WHATSAPP QR */}
      {showWhatsappStatusModal && (
        <div className="modal show">
          <div className="modal-content" style={{ maxWidth:'420px', textAlign:'center' }}>
            <div className="modal-header">
              <h2>WhatsApp — PayTrack</h2>
              <button className="close-btn" onClick={() => setShowWhatsappStatusModal(false)}>×</button>
            </div>
            <div style={{ padding:'1rem' }}>
              {whatsappConectado ? (
                <div>
                  <div style={{ width:'60px', height:'60px', borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
                    <MessageCircle size={28} style={{ color:'#16a34a' }}/>
                  </div>
                  <div style={{ fontSize:'16px', fontWeight:700, color:'#16a34a', marginBottom:'8px' }}>WhatsApp Conectado</div>
                  <div style={{ fontSize:'13px', color:'#9a998f', marginBottom:'1.5rem' }}>Los mensajes se enviarán automáticamente</div>
                  <button onClick={async () => { if(window.electronAPI) { await window.electronAPI.whatsappCerrarSesion(); setWhatsappConectado(false); setWhatsappQR(null); } }} style={{ padding:'8px 20px', borderRadius:'8px', fontSize:'13px', fontWeight:600, border:'1px solid #fca5a5', background:'#fee2e2', color:'#dc2626', cursor:'pointer' }}>
                    Cerrar sesión WhatsApp
                  </button>
                </div>
              ) : whatsappQR ? (
                <div>
                  <div style={{ fontSize:'13px', color:'#9a998f', marginBottom:'1rem' }}>Escanea este QR con tu WhatsApp</div>
                  <img src={whatsappQR} alt="QR WhatsApp" style={{ width:'240px', height:'240px', borderRadius:'12px', border:'1px solid #e0dfd8' }}/>
                  <div style={{ fontSize:'12px', color:'#9a998f', marginTop:'1rem' }}>Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize:'13px', color:'#9a998f', marginBottom:'1rem' }}>Iniciando WhatsApp...</div>
                  <div style={{ width:'40px', height:'40px', border:'3px solid #6366f1', borderTop:'3px solid transparent', borderRadius:'50%', margin:'0 auto', animation:'spin 1s linear infinite' }}></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {sessionExpired && (
        <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(6px)' }}>
          <div className="modal-content" style={{ maxWidth: '380px', textAlign: 'center', padding: '2.5rem 2rem' }}>
            <Clock size={56} style={{ color:'var(--text-muted)', marginBottom:'1rem' }}/>
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

      {/* ── Command Palette (Ctrl+K) ─────────────────────────── */}
      {showCommandPalette && (() => {
        const quickActions = [
          { id: 'dashboard', label: 'Inicio / Dashboard', Icon: LayoutGrid, action: () => { setActiveTab('dashboard'); setShowCommandPalette(false); } },
          { id: 'cartera',   label: 'Cartera',            Icon: BarChart2,   action: () => { setActiveTab('cartera');   setShowCommandPalette(false); } },
          { id: 'nuevo',     label: 'Nuevo Cliente',      Icon: UserPlus,    action: () => { setActiveTab('cartera'); abrirModal(); setShowCommandPalette(false); }, show: tienePermiso('crear_clientes') },
          { id: 'agenda',    label: 'Agenda del Día',     Icon: Calendar,    action: () => { setActiveTab('agenda');    setShowCommandPalette(false); } },
          { id: 'reactiv',   label: 'Reactivación',       Icon: Archive,     action: () => { setActiveTab('reactivacion'); setShowCommandPalette(false); } },
          { id: 'dark',      label: darkMode ? 'Modo Claro' : 'Modo Oscuro', Icon: darkMode ? Sun : Moon, action: () => { setDarkMode(v => !v); setShowCommandPalette(false); } },
        ].filter(a => a.show !== false);

        const filtered = commandQuery ? quickActions.filter(a => a.label.toLowerCase().includes(commandQuery.toLowerCase())) : quickActions;
        const clientResults = commandQuery.length > 1
          ? clientes.filter(c => c.nombre.toLowerCase().includes(commandQuery.toLowerCase()) || (c.codigoCliente||'').toLowerCase().includes(commandQuery.toLowerCase()) || (c.contacto||'').includes(commandQuery)).slice(0,5)
          : [];
        const allResults = [
          ...filtered.map(a => ({ ...a, type: 'action', sub: null })),
          ...clientResults.map(c => ({ id: `c${c.id}`, label: c.nombre, sub: `${c.codigoCliente?'#'+c.codigoCliente:'#'+c.id} · ${estadoActivoCliente(c)}`, Icon: Users, type: 'client', action: () => { setActiveTab('cartera'); setSearchTerm(c.nombre); setShowCommandPalette(false); } })),
        ];
        return (
          <div className="command-palette-overlay" onClick={() => setShowCommandPalette(false)}>
            <div className="command-palette" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                <Command size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
                <input
                  autoFocus
                  placeholder="Buscar cliente o acción..."
                  value={commandQuery}
                  onChange={e => { setCommandQuery(e.target.value); setCommandIdx(0); }}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setCommandIdx(i => Math.min(i+1, allResults.length-1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setCommandIdx(i => Math.max(i-1, 0)); }
                    else if (e.key === 'Enter' && allResults[commandIdx]) allResults[commandIdx].action();
                  }}
                  style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.95rem', color: 'var(--text)', outline: 'none' }}
                />
              </div>
              <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                {filtered.length > 0 && <div className="command-section-label">Acciones rápidas</div>}
                {filtered.map((item, idx) => (
                  <button key={item.id} className={`command-item${commandIdx===idx?' selected':''}`} onClick={item.action} onMouseEnter={() => setCommandIdx(idx)}>
                    <item.Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <kbd style={{ fontSize: '0.65rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.1rem 0.35rem', color: 'var(--text-muted)' }}>↵</kbd>
                  </button>
                ))}
                {clientResults.length > 0 && <div className="command-section-label">Clientes</div>}
                {clientResults.map((item, idx) => {
                  const realIdx = filtered.length + idx;
                  return (
                    <button key={item.id} className={`command-item${commandIdx===realIdx?' selected':''}`} onClick={item.action} onMouseEnter={() => setCommandIdx(realIdx)}>
                      <item.Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.sub}</span>
                    </button>
                  );
                })}
                {allResults.length === 0 && (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin resultados para "{commandQuery}"</div>
                )}
              </div>
              <div style={{ padding: '0.5rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                <span>↑↓ navegar</span><span>↵ seleccionar</span><span>Esc cerrar</span>
                <span style={{ marginLeft: 'auto' }}>Ctrl+K</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}${t.removing ? ' removing' : ''}`}>
            {t.type === 'success' ? <CheckCircle size={15}/> : t.type === 'error' ? <XCircle size={15}/> : <Info size={15}/>}
            {t.msg}
          </div>
        ))}
      </div>


    </div>
  );
}
