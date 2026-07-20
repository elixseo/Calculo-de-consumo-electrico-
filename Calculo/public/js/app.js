// App Global State
const state = {
  selectedMonth: '',
  selectedBU: '',
  selectedService: '',
  selectedMachine: '',
  searchText: '',
  currentPage: 1,
  limit: 50,
  selectedFile: null,
  currentUser: null,
  token: null,
  excludedServices: new Set(),
  excludedMachines: new Set(),
  _machinesConfigLoaded: false,
  charts: {
    trend: null,
    machines: null,
    services: null
  }
};

// Load excluded services & machines from localStorage on startup
function loadExcludedServices() {
  const saved = localStorage.getItem('excludedServices');
  if (saved) {
    state.excludedServices = new Set(JSON.parse(saved));
  }
  const savedMachines = localStorage.getItem('excludedMachines');
  if (savedMachines) {
    state.excludedMachines = new Set(JSON.parse(savedMachines));
  }
}

// API Base URL
const API_BASE = '/api';

// ─── AUTH HELPERS ──────────────────────────────────────────────────────────
function getAuthHeaders() {
  return { 'Authorization': `Bearer ${state.token}`, 'Content-Type': 'application/json' };
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-do-login');

  errEl.classList.remove('visible');
  if (!username || !password) {
    errEl.textContent = 'Ingrese usuario y contraseña.';
    errEl.classList.add('visible');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Iniciando sesión...';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Credenciales incorrectas.');

    state.token = data.token;
    state.currentUser = data.user;
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user', JSON.stringify(data.user));

    document.getElementById('login-screen').style.display = 'none';
    applyRoleUI(data.user);
    await initApp();

  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('visible');
    document.getElementById('login-username').classList.add('input-error');
    document.getElementById('login-password').classList.add('input-error');
    setTimeout(() => {
      document.getElementById('login-username').classList.remove('input-error');
      document.getElementById('login-password').classList.remove('input-error');
    }, 600);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar al Sistema';
  }
}

async function doLogout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: getAuthHeaders() });
  } catch (_) {}
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

function applyRoleUI(user) {
  // Sidebar user info
  document.getElementById('sidebar-nombre').textContent = user.nombre;
  document.getElementById('sidebar-role').textContent = user.role === 'admin' ? '🔑 Administrador' : '👤 Supervisor';
  document.getElementById('sidebar-avatar').textContent = user.nombre.charAt(0).toUpperCase();

  // Show/hide admin-only items
  const adminItems = document.querySelectorAll('.admin-only');
  adminItems.forEach(el => {
    el.style.display = user.role === 'admin' ? '' : 'none';
  });
}

// On Document Load: check existing session
document.addEventListener('DOMContentLoaded', () => {
  // Allow Enter key to login
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('login-username').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
  });

  const savedToken = localStorage.getItem('auth_token');
  const savedUser = localStorage.getItem('auth_user');

  if (savedToken && savedUser) {
    state.token = savedToken;
    state.currentUser = JSON.parse(savedUser);
    // Verify token is still valid
    fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() }).then(r => {
      if (r.ok) {
        document.getElementById('login-screen').style.display = 'none';
        applyRoleUI(state.currentUser);
        initApp();
        setupDragAndDrop();
      } else {
        // Token expired, show login
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    });
  } else {
    setupDragAndDrop();
  }
});

// Initialize Application
async function initApp() {
  loadExcludedServices();
  showToast('Cargando...', 'info', 'Iniciando el sistema');
  await loadMonths();
  if (state.selectedMonth) {
    await loadServices();
    await loadMachines();
    await loadConfigServices();
    updateFilterDisplay();
    refreshData();
  } else {
    switchTab('import');
    showToast('Base de datos vacía', 'warning', 'Por favor, cargue una planilla Excel para comenzar.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION: Manage excluded services
// ═══════════════════════════════════════════════════════════════════════════

async function loadConfigServices() {
  try {
    let url = `${API_BASE}/servicios`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar servicios.');
    const services = await response.json();

    const container = document.getElementById('services-config-list');
    if (!services || services.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim); text-align:center;">No hay servicios disponibles.</p>';
      return;
    }

    container.innerHTML = '';
    const serviceList = document.createElement('div');
    serviceList.className = 'service-config-items';
    serviceList.id = 'service-config-items';

    services.forEach(svc => {
      const isExcluded = state.excludedServices.has(String(svc.nro_casa));
      const nombre = svc.nombre_servicio || `Servicio Casa ${svc.nro_casa}`;
      const item = document.createElement('label');
      item.className = 'service-config-item';
      item.innerHTML = `
        <input type="checkbox" class="config-service-checkbox" value="${svc.nro_casa}" ${!isExcluded ? 'checked' : ''} />
        <span class="config-badge">N° ${svc.nro_casa}</span>
        <span class="service-name">${nombre}</span>
      `;
      serviceList.appendChild(item);
    });

    container.appendChild(serviceList);
  } catch (error) {
    console.error('Error loading config services:', error);
    document.getElementById('services-config-list').innerHTML = '<p style="color:red;">Error al cargar servicios.</p>';
  }
}

function filterConfigServices(searchText) {
  const items = document.querySelectorAll('#service-config-items .service-config-item');
  const text = searchText.toLowerCase();
  items.forEach(item => {
    const label = item.textContent.toLowerCase();
    item.style.display = label.includes(text) ? '' : 'none';
  });
}

function selectAllServices() {
  document.querySelectorAll('.config-service-checkbox').forEach(cb => {
    cb.checked = true;
  });
}

function deselectAllServices() {
  document.querySelectorAll('.config-service-checkbox').forEach(cb => {
    cb.checked = false;
  });
}

function saveConfigServices() {
  const checkboxes = document.querySelectorAll('.config-service-checkbox');
  const excluded = new Set();

  checkboxes.forEach(cb => {
    if (!cb.checked) {
      excluded.add(String(cb.value));
    }
  });

  state.excludedServices = excluded;
  localStorage.setItem('excludedServices', JSON.stringify(Array.from(excluded)));
  showToast('Éxito', 'success', 'Configuración guardada. Actualizando datos...');

  state.currentPage = 1;
  refreshData();
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION: Manage excluded machines
// ═══════════════════════════════════════════════════════════════════════════

function switchConfigSubtab(name) {
  // Toggle buttons
  document.querySelectorAll('.config-subtab').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`subtab-btn-${name}`).classList.add('active');

  // Toggle panels
  document.querySelectorAll('.config-subpanel').forEach(p => p.classList.remove('active'));
  document.getElementById(`config-subpanel-${name}`).classList.add('active');

  // Lazy-load machines the first time
  if (name === 'machines' && !state._machinesConfigLoaded) {
    loadConfigMachines();
  }
}

async function loadConfigMachines() {
  try {
    const response = await fetch(`${API_BASE}/maquinas`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar máquinas.');
    const machines = await response.json();

    const container = document.getElementById('machines-config-list');
    if (!machines || machines.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim); text-align:center;">No hay máquinas disponibles.</p>';
      return;
    }

    container.innerHTML = '';
    const machineList = document.createElement('div');
    machineList.className = 'service-config-items';
    machineList.id = 'machine-config-items';

    machines.forEach(m => {
      const isExcluded = state.excludedMachines.has(String(m.nro_maquina));
      const nombre = m.maquina || `Máquina ${m.nro_maquina}`;
      const marca = m.marca ? ` — ${m.marca}` : '';
      const item = document.createElement('label');
      item.className = 'service-config-item';
      item.innerHTML = `
        <input type="checkbox" class="config-machine-checkbox" value="${m.nro_maquina}" ${!isExcluded ? 'checked' : ''} />
        <span class="config-badge">N° ${m.nro_maquina}</span>
        <span class="service-name">${nombre}${marca}</span>
      `;
      machineList.appendChild(item);
    });

    container.appendChild(machineList);
    state._machinesConfigLoaded = true;
  } catch (error) {
    console.error('Error loading config machines:', error);
    document.getElementById('machines-config-list').innerHTML = '<p style="color:red;">Error al cargar máquinas.</p>';
  }
}

function filterConfigMachines(searchText) {
  const items = document.querySelectorAll('#machine-config-items .service-config-item');
  const text = searchText.toLowerCase();
  items.forEach(item => {
    const label = item.textContent.toLowerCase();
    item.style.display = label.includes(text) ? '' : 'none';
  });
}

function selectAllMachines() {
  document.querySelectorAll('.config-machine-checkbox').forEach(cb => {
    cb.checked = true;
  });
}

function deselectAllMachines() {
  document.querySelectorAll('.config-machine-checkbox').forEach(cb => {
    cb.checked = false;
  });
}

function saveConfigMachines() {
  const checkboxes = document.querySelectorAll('.config-machine-checkbox');
  const excluded = new Set();

  checkboxes.forEach(cb => {
    if (!cb.checked) {
      excluded.add(String(cb.value));
    }
  });

  state.excludedMachines = excluded;
  localStorage.setItem('excludedMachines', JSON.stringify(Array.from(excluded)));
  showToast('Éxito', 'success', 'Configuración guardada. Actualizando datos...');

  state.currentPage = 1;
  refreshData();
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTUALIZAR DATOS: subir potencia y horas desde Excel
// ═══════════════════════════════════════════════════════════════════════════

let potenciaFile = null;
let horasFile = null;

// Llena el selector de mes del panel Actualizar Datos
async function loadHorasMesSelect() {
  const sel = document.getElementById('horas-mes-select');
  if (!sel) return;
  try {
    const response = await fetch(`${API_BASE}/meses`, { headers: getAuthHeaders() });
    const months = await response.json();
    sel.innerHTML = '';
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    months.forEach(m => {
      const [y, mo] = m.split('-');
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${monthNames[parseInt(mo) - 1]} ${y}`;
      sel.appendChild(opt);
    });
    if (state.selectedMonth) sel.value = state.selectedMonth;
  } catch (e) {
    console.error('Error cargando meses:', e);
  }
}

function onPotenciaFile(input) {
  potenciaFile = input.files[0] || null;
  document.getElementById('potencia-filename').textContent = potenciaFile ? potenciaFile.name : 'Hacé clic para elegir el archivo de Potencia';
  document.getElementById('btn-subir-potencia').disabled = !potenciaFile;
}

function onHorasFile(input) {
  horasFile = input.files[0] || null;
  document.getElementById('horas-filename').textContent = horasFile ? horasFile.name : 'Hacé clic para elegir el archivo de Horas';
  document.getElementById('btn-subir-horas').disabled = !horasFile;
}

async function subirPotencia() {
  if (!potenciaFile) return;
  const btn = document.getElementById('btn-subir-potencia');
  const result = document.getElementById('potencia-result');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
  result.innerHTML = '';

  try {
    const formData = new FormData();
    formData.append('file', potenciaFile);
    const response = await fetch(`${API_BASE}/import/potencia`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar potencia.');

    result.innerHTML = `<div class="update-ok"><i class="fa-solid fa-circle-check"></i> ${data.message} (hoja: ${data.hoja})</div>`;
    showToast('Potencia actualizada', 'success', data.message);
    if (state.selectedMonth) refreshData();
  } catch (err) {
    result.innerHTML = `<div class="update-err"><i class="fa-solid fa-circle-exclamation"></i> ${err.message}</div>`;
    showToast('Error', 'error', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Actualizar Potencia';
  }
}

async function subirHoras() {
  if (!horasFile) return;
  const mes = document.getElementById('horas-mes-select').value;
  if (!mes) { showToast('Falta período', 'warning', 'Seleccioná un período.'); return; }

  const btn = document.getElementById('btn-subir-horas');
  const result = document.getElementById('horas-result');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
  result.innerHTML = '';

  try {
    const formData = new FormData();
    formData.append('file', horasFile);
    formData.append('mes', mes);
    const response = await fetch(`${API_BASE}/import/horas`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar horas.');

    result.innerHTML = `<div class="update-ok"><i class="fa-solid fa-circle-check"></i> ${data.message} (hoja: ${data.hoja})</div>`;
    showToast('Horas actualizadas', 'success', data.message);
    if (state.selectedMonth) refreshData();
  } catch (err) {
    result.innerHTML = `<div class="update-err"><i class="fa-solid fa-circle-exclamation"></i> ${err.message}</div>`;
    showToast('Error', 'error', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Actualizar Horas';
  }
}


// Load Months Dropdown (with auth header)
async function loadMonths() {
  try {
    const response = await fetch(`${API_BASE}/meses`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar los períodos.');
    const months = await response.json();

    const selectHeader = document.getElementById('select-month-header');
    const selectImportMonth = document.getElementById('import-month');
    const selectImportYear = document.getElementById('import-year');

    if (selectHeader) selectHeader.innerHTML = '';

    if (months.length > 0) {
      months.forEach(m => {
        if (selectHeader) {
          const option = document.createElement('option');
          option.value = m;
          const [year, month] = m.split('-');
          const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
          option.textContent = `${monthNames[parseInt(month) - 1]} ${year}`;
          selectHeader.appendChild(option);
        }
      });
      if (!state.selectedMonth) state.selectedMonth = months[0];
      if (selectHeader) selectHeader.value = state.selectedMonth;
      const [currYear, currMonth] = state.selectedMonth.split('-');
      if (selectImportYear) selectImportYear.value = currYear;
      if (selectImportMonth) selectImportMonth.value = currMonth;
    } else {
      if (selectHeader) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Sin datos';
        selectHeader.appendChild(option);
      }
    }
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// Switch SPA Tabs
function switchTab(tabName) {
  // Hide all panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  
  // Show target panel
  const targetPanel = document.getElementById(`tab-${tabName}`);
  if (targetPanel) targetPanel.classList.add('active');
  
  // Update nav buttons
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`btn-nav-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');
  
  // Update headers and load specific views
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  
  if (tabName === 'dashboard') {
    pageTitle.textContent = 'Panel General de Consumo';
    pageSubtitle.textContent = 'Indicadores y estadísticas de consumo eléctrico de maquinarias';
    if (state.selectedMonth) fetchDashboard();
  } else if (tabName === 'table') {
    pageTitle.textContent = 'Cálculos Detallados';
    pageSubtitle.textContent = 'Vista de inventario de consumo y modificación en línea';
    if (state.selectedMonth) fetchTable();
  } else if (tabName === 'import') {
    pageTitle.textContent = 'Carga y Actualización';
    pageSubtitle.textContent = 'Actualice los datos cargando planillas de inventario';
    fetchImports();
  } else if (tabName === 'horas') {
    pageTitle.textContent = 'Carga de Horas';
    pageSubtitle.textContent = 'Ingrese las horas de uso por máquina y cierre el período con foto de auditoría';
    if (state.selectedMonth) fetchHorasAccordion();
  } else if (tabName === 'users') {
    pageTitle.textContent = 'Gestión de Usuarios';
    pageSubtitle.textContent = 'Administre usuarios y asigne servicios a supervisores';
    fetchUsers();
  } else if (tabName === 'actualizar') {
    pageTitle.textContent = 'Actualizar Datos';
    pageSubtitle.textContent = 'Actualice potencia y horas de las máquinas desde Excel';
    loadHorasMesSelect();
  }
}

// Global Filter Handlers
async function onPeriodChange(val) {
  if (!val) return;
  state.selectedMonth = val;
  state.selectedService = '';
  state.selectedMachine = '';
  state.currentPage = 1;

  // Sync header selector
  const selectHeader = document.getElementById('select-month-header');
  if (selectHeader) selectHeader.value = val;

  await loadServices();
  await loadMachines();
  updateFilterDisplay();
  refreshData();
}

async function onBUChange(val) {
  state.selectedBU = val;
  state.selectedService = '';
  state.selectedMachine = '';
  state.currentPage = 1;

  // Sync header selector
  const selectHeader = document.getElementById('select-bu-header');
  if (selectHeader) selectHeader.value = val;

  await loadServices();
  await loadMachines();
  updateFilterDisplay();
  refreshData();
}

async function loadServices() {
  if (!state.selectedMonth) return;
  try {
    let url = `${API_BASE}/servicios?mes=${state.selectedMonth}`;
    if (state.selectedBU) url += `&unidad=${encodeURIComponent(state.selectedBU)}`;

    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar la lista de servicios.');
    const services = await response.json();

    // Update both sidebar and panel selectors
    const selectGlobal = document.getElementById('select-service-global');
    const selectPanel = document.getElementById('select-service-panel');

    if (selectGlobal) {
      selectGlobal.innerHTML = '<option value="">Todos los Servicios</option>';
      services.forEach(s => {
        const option = document.createElement('option');
        option.value = s.nro_casa;
        option.textContent = s.nombre_servicio || `Servicio Casa ${s.nro_casa}`;
        selectGlobal.appendChild(option);
      });
    }

    if (selectPanel) {
      selectPanel.innerHTML = '<option value="">Todos los Servicios</option>';
      services.forEach(s => {
        const option = document.createElement('option');
        option.value = s.nro_casa;
        option.textContent = s.nombre_servicio || `Servicio Casa ${s.nro_casa}`;
        selectPanel.appendChild(option);
      });
    }

    // Maintain selection if still available
    const stillExists = services.some(s => String(s.nro_casa) === String(state.selectedService));
    if (stillExists) {
      if (selectGlobal) selectGlobal.value = state.selectedService;
      if (selectPanel) selectPanel.value = state.selectedService;
    } else {
      state.selectedService = '';
      if (selectGlobal) selectGlobal.value = '';
      if (selectPanel) selectPanel.value = '';
    }
  } catch (error) {
    console.error('Error loading services:', error);
  }
}

function onServiceChange(val) {
  state.selectedService = val;
  state.selectedMachine = '';
  state.currentPage = 1;
  loadMachines();
  refreshData();
}

async function loadMachines() {
  if (!state.selectedMonth) return;
  try {
    let url = `${API_BASE}/consumo?mes=${state.selectedMonth}&limit=1000`;
    if (state.selectedBU) url += `&unidad=${encodeURIComponent(state.selectedBU)}`;
    if (state.selectedService) url += `&servicio=${state.selectedService}`;

    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar la lista de máquinas.');
    const data = await response.json();

    // Extract unique machines
    const machineMap = new Map();
    data.rows.forEach(row => {
      const key = `${row.nro_maquina}-${row.maquina}`;
      if (!machineMap.has(key)) {
        machineMap.set(key, {
          nro_maquina: row.nro_maquina,
          maquina: row.maquina
        });
      }
    });

    // Update both sidebar and panel selectors
    const selectGlobal = document.getElementById('select-machine-global');
    const selectPanel = document.getElementById('select-machine-panel');

    const machines = Array.from(machineMap.values())
      .sort((a, b) => a.maquina.localeCompare(b.maquina));

    if (selectGlobal) {
      selectGlobal.innerHTML = '<option value="">Todas las Máquinas</option>';
      machines.forEach(m => {
        const option = document.createElement('option');
        option.value = m.nro_maquina;
        option.textContent = `${m.maquina} (N° ${m.nro_maquina})`;
        selectGlobal.appendChild(option);
      });
    }

    if (selectPanel) {
      selectPanel.innerHTML = '<option value="">Todas las Máquinas</option>';
      machines.forEach(m => {
        const option = document.createElement('option');
        option.value = m.nro_maquina;
        option.textContent = `${m.maquina} (N° ${m.nro_maquina})`;
        selectPanel.appendChild(option);
      });
    }

    // Maintain selection if still available
    const stillExists = Array.from(machineMap.keys()).some(key =>
      key.startsWith(state.selectedMachine + '-')
    );
    if (stillExists && state.selectedMachine) {
      if (selectGlobal) selectGlobal.value = state.selectedMachine;
      if (selectPanel) selectPanel.value = state.selectedMachine;
    } else {
      state.selectedMachine = '';
      if (selectGlobal) selectGlobal.value = '';
      if (selectPanel) selectPanel.value = '';
    }
  } catch (error) {
    console.error('Error loading machines:', error);
  }
}

function onMachineChange(val) {
  state.selectedMachine = val;
  state.currentPage = 1;
  refreshData();
}

function refreshData() {
  const activeTab = document.querySelector('.sidebar-menu .menu-item.active').id;
  if (activeTab.includes('dashboard')) {
    fetchDashboard();
  } else if (activeTab.includes('table')) {
    fetchTable();
  }
}

// Search debounce
let searchTimeout;
function onSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.searchText = document.getElementById('input-search').value.trim();
    state.currentPage = 1;
    fetchTable();
  }, 400);
}

// --- FETCH DASHBOARD DATA ---
async function fetchDashboard() {
  if (!state.selectedMonth) return;

  try {
    let url = `${API_BASE}/dashboard?mes=${state.selectedMonth}`;
    if (state.selectedBU) url += `&unidad=${encodeURIComponent(state.selectedBU)}`;
    if (state.selectedService) url += `&servicio=${state.selectedService}`;
    if (state.selectedMachine) url += `&maquina=${state.selectedMachine}`;
    
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar datos del dashboard.');
    const data = await response.json();
    
    // Update KPI values
    document.getElementById('kpi-active-machines').textContent = data.kpis.cantMaquinas.toLocaleString();
    document.getElementById('kpi-services').textContent = data.kpis.cantServicios.toLocaleString();
    document.getElementById('kpi-total-power').textContent = `${data.kpis.totalPotenciaKw.toFixed(1)} kW`;
    document.getElementById('kpi-daily-consumption').textContent = `${data.kpis.totalConsumoDiaKwh.toFixed(1)} kWh/día`;
    document.getElementById('kpi-monthly-consumption').textContent = `${data.kpis.totalConsumoMesKwh.toFixed(1)} kWh/mes`;
    
    // Update chart card titles dynamically
    const trendTitle = document.getElementById('chart-trend-title');
    const servicesTitle = document.getElementById('chart-services-title');

    if (state.selectedService) {
      // If service is selected, show service-specific title
      const selectSvc = document.getElementById('select-service-global');
      const svcName = selectSvc?.options[selectSvc.selectedIndex]?.text || state.selectedService;
      trendTitle.textContent = `Histórico de Consumo del Servicio: ${svcName} (kWh / Mes)`;
      servicesTitle.textContent = `Consumo por Máquina en este Servicio (Top 8)`;
    } else if (state.selectedBU) {
      // If business unit is selected, show unit-specific title
      trendTitle.textContent = `Histórico de Consumo - ${state.selectedBU} (kWh / Mes)`;
      servicesTitle.textContent = `Consumo por Servicio / Cliente en ${state.selectedBU} (Top 8)`;
    } else {
      // Default: show both units
      trendTitle.textContent = 'Histórico de Consumo por Unidad de Negocio (kWh / Mes)';
      servicesTitle.textContent = 'Consumo por Servicio / Cliente (Top 8)';
    }

    // Render Charts
    renderTrendChart(data.chartTrend);
    renderMachinesChart(data.chartMaquinas);
    renderServicesChart(data.chartServicios);
    
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// --- FETCH DETAILED TABLE ---
async function fetchTable() {
  if (!state.selectedMonth) return;

  try {
    let url = `${API_BASE}/consumo?mes=${state.selectedMonth}&page=${state.currentPage}&limit=${state.limit}`;
    if (state.selectedBU) url += `&unidad=${encodeURIComponent(state.selectedBU)}`;
    if (state.selectedService) url += `&servicio=${state.selectedService}`;
    if (state.selectedMachine) url += `&maquina=${state.selectedMachine}`;
    if (state.searchText) url += `&search=${encodeURIComponent(state.searchText)}`;
    
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar la tabla de cálculos.');
    const data = await response.json();
    
    renderTable(data.rows);
    renderPagination(data.total, data.page, data.totalPages);
    
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// Filter rows by excluded services and machines
function filterRowsByExcludedServices(rows) {
  return rows.filter(row =>
    !state.excludedServices.has(String(row.nro_casa)) &&
    !state.excludedMachines.has(String(row.nro_maquina))
  );
}

// Días del mes seleccionado (formato YYYY-MM)
function getDiasDelMes(mes) {
  if (!mes) return 30;
  const [year, month] = mes.split('-');
  return new Date(parseInt(year), parseInt(month), 0).getDate();
}

// Render Table Rows
function renderTable(rows) {
  const filteredRows = filterRowsByExcludedServices(rows);
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  if (filteredRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-dim); padding: 40px;">No se encontraron registros.</td></tr>`;
    return;
  }

  const diasDelMes = getDiasDelMes(state.selectedMonth);

  filteredRows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.id = row.id;
    
    // Highlight Ceiling Solution rows subtly
    if (row.unidad_negocio === 'Ceiling Solution S.A.') {
      tr.style.borderLeft = '2px solid var(--purple)';
    } else {
      tr.style.borderLeft = '2px solid var(--cyan)';
    }
    
    const servicioNombre = row.nombre_servicio || `Casa ${row.nro_casa}`;
    const maquinaNombre = row.maquina || '-';
    const servicioDisplay = servicioNombre.length > 40 ? `${servicioNombre.substring(0, 40)}...` : servicioNombre;
    const maquinaDisplay = maquinaNombre.length > 30 ? `${maquinaNombre.substring(0, 30)}...` : maquinaNombre;

    // Consumo mensual en kWh = (Wh/día × días del mes) / 1000
    const consumoMes = (row.calculo * diasDelMes) / 1000;

    tr.innerHTML = `
      <td title="${servicioNombre}" class="long-text-tooltip" data-tooltip="${servicioNombre}">${servicioDisplay}</td>
      <td>${row.nro_casa}</td>
      <td><strong>${row.nro_maquina}</strong></td>
      <td title="${maquinaNombre}" class="long-text-tooltip" data-tooltip="${maquinaNombre}">${maquinaDisplay}</td>
      <td>${row.marca || '-'}</td>
      <td>${row.modelo || '-'}</td>
      <td>${row.fecha_incorporacion || '-'}</td>
      <td style="text-align: right;">${row.potencia.toFixed(1)}</td>
      <td style="text-align: right;">${row.hs_dia.toFixed(2)}</td>
      <td style="text-align: right; font-weight: 600;">${row.calculo.toFixed(1)}</td>
      <td style="text-align: right; font-weight: 600; color: var(--cyan);">${consumoMes.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Table Pagination Controls
function renderPagination(total, page, totalPages) {
  state.totalPages = totalPages;
  
  const start = total === 0 ? 0 : (page - 1) * state.limit + 1;
  const end = Math.min(page * state.limit, total);
  
  document.getElementById('pag-start').textContent = start;
  document.getElementById('pag-end').textContent = end;
  document.getElementById('pag-total').textContent = total;
  
  const btnPrev = document.getElementById('btn-pag-prev');
  const btnNext = document.getElementById('btn-pag-next');
  
  btnPrev.disabled = page <= 1;
  btnNext.disabled = page >= totalPages || totalPages === 0;
  
  const pagNumbers = document.getElementById('pag-numbers');
  pagNumbers.innerHTML = '';
  
  // Show page number buttons
  let startPage = Math.max(1, page - 2);
  let endPage = Math.min(totalPages, page + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    const span = document.createElement('span');
    span.className = `pag-num ${i === page ? 'active' : ''}`;
    span.textContent = i;
    span.onclick = () => {
      state.currentPage = i;
      fetchTable();
    };
    pagNumbers.appendChild(span);
  }
}

function prevPage() {
  if (state.currentPage > 1) {
    state.currentPage--;
    fetchTable();
  }
}

// Page Navigation
function nextPage() {
  if (state.currentPage < state.totalPages) {
    state.currentPage++;
    fetchTable();
  }
}

// --- EDIT INLINE MODAL ---
async function openEditModal(id) {
  try {
    const response = await fetch(`${API_BASE}/consumo/${id}`);
    if (!response.ok) throw new Error('No se pudo recuperar el registro.');
    const data = await response.json();
    
    // We also need the details of service and machine names
    const rowEl = document.querySelector(`tr[data-id="${id}"]`);
    const serviceName = rowEl.children[0].textContent;
    const machineName = rowEl.children[3].textContent;
    
    document.getElementById('edit-row-id').value = id;
    document.getElementById('edit-info-service').textContent = serviceName;
    document.getElementById('edit-info-nro-machine').textContent = data.nro_maquina;
    document.getElementById('edit-info-machine').textContent = machineName;
    
    // Fetch master machine detail to get power (might be different/updated)
    document.getElementById('edit-potencia').value = rowEl.children[7].textContent;
    document.getElementById('edit-hs-dia').value = rowEl.children[8].textContent;
    
    document.getElementById('edit-modal').classList.add('active');
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
  document.getElementById('form-edit').reset();
}

async function handleEditSave(event) {
  event.preventDefault();
  const id = document.getElementById('edit-row-id').value;
  const potencia = parseFloat(document.getElementById('edit-potencia').value);
  const hs_dia = parseFloat(document.getElementById('edit-hs-dia').value);
  
  if (isNaN(potencia) || potencia < 0 || isNaN(hs_dia) || hs_dia < 0 || hs_dia > 24) {
    showToast('Datos inválidos', 'error', 'Revise los valores ingresados (horas debe estar entre 0 y 24).');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/consumo/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ potencia, hs_dia })
    });
    
    if (!response.ok) throw new Error('Error al actualizar el registro en el servidor.');
    
    showToast('Registro guardado', 'success', 'Los cambios y consumos se actualizaron correctamente.');
    closeEditModal();
    fetchTable(); // Reload active view
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// --- EXCEL FILE IMPORT ---
function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('import-file');
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });
  
  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      fileInput.files = files;
      onFileSelected(fileInput);
    }
  });
}

function onFileSelected(input) {
  if (input.files.length > 0) {
    state.selectedFile = input.files[0];
    
    document.getElementById('selected-file-name').textContent = state.selectedFile.name;
    const sizeKb = (state.selectedFile.size / 1024).toFixed(1);
    document.getElementById('selected-file-size').textContent = `${sizeKb} KB`;
    
    document.getElementById('selected-file-info').style.display = 'flex';
    document.getElementById('btn-import-submit').disabled = false;
  }
}

function clearSelectedFile() {
  state.selectedFile = null;
  document.getElementById('import-file').value = '';
  document.getElementById('selected-file-info').style.display = 'none';
  document.getElementById('btn-import-submit').disabled = true;
}

async function handleImport(event) {
  event.preventDefault();
  if (!state.selectedFile) return;
  
  const year = document.getElementById('import-year').value;
  const month = document.getElementById('import-month').value;
  const targetPeriod = `${year}-${month}`;
  
  const formData = new FormData();
  formData.append('mes', targetPeriod);
  formData.append('file', state.selectedFile);
  
  const submitBtn = document.getElementById('btn-import-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando Importación...';
  
  showToast('Procesando', 'info', 'Leyendo y actualizando base de datos...');
  
  try {
    const response = await fetch(`${API_BASE}/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData
    });
    
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al importar archivo.');
    
    showToast('Importación exitosa', 'success', result.message);
    
    // Reset form and reload
    clearSelectedFile();
    await loadMonths(); // Reload months dropdown in case new months were added
    state.selectedMonth = targetPeriod;
    const selectHeader = document.getElementById('select-month-header');
    if (selectHeader) selectHeader.value = state.selectedMonth;

    // Switch to dashboard
    switchTab('dashboard');
  } catch (error) {
    showToast('Error de Carga', 'error', error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Importar y Calcular';
  }
}

// Fetch and render imports log
async function fetchImports() {
  try {
    const response = await fetch(`${API_BASE}/imports`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar historial.');
    const data = await response.json();
    
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 24px;">No hay registros de importaciones previas.</td></tr>`;
      return;
    }
    
    data.forEach(row => {
      const tr = document.createElement('tr');
      // Format month string
      const [year, month] = row.mes.split('-');
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const formattedMonth = `${monthNames[parseInt(month) - 1]} ${year}`;
      
      const loadDate = new Date(row.fecha_importacion).toLocaleString('es-AR');
      
      tr.innerHTML = `
        <td><i class="fa-solid fa-file-excel text-muted" style="margin-right: 8px;"></i><strong>${row.filename}</strong></td>
        <td><span class="badge">${formattedMonth}</span></td>
        <td>${row.total_filas} filas</td>
        <td class="text-muted" style="font-size: 12px;">${loadDate}</td>
        <td class="actions-col">
          <button class="btn-icon" onclick="deleteMonthData('${row.mes}')" title="Eliminar este período" style="color: var(--red);">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// Delete all calculations of a specific month
async function deleteMonthData(mes) {
  const confirmDel = confirm(`¿Está seguro que desea eliminar todos los datos importados para el período ${mes}? Esta acción no se puede deshacer.`);
  if (!confirmDel) return;
  
  try {
    const response = await fetch(`${API_BASE}/mes/${mes}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al eliminar período.');
    
    showToast('Período eliminado', 'success', `Los datos del período ${mes} han sido purgados.`);
    
    await loadMonths(); // Reload months dropdown
    if (state.selectedMonth === mes) {
      const selectHeader = document.getElementById('select-month-header');
      if (selectHeader) {
        state.selectedMonth = selectHeader.value; // set to next available
      }
    }
    
    // Refresh active view
    fetchImports();
    if (state.selectedMonth) {
      refreshData();
    } else {
      switchTab('import');
    }
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// --- EXPORT TO CSV ---
async function exportDataToCSV() {
  if (!state.selectedMonth) return;
  
  try {
    // Fetch all rows for the month without page limit (e.g. limit=10000)
    let url = `${API_BASE}/consumo?mes=${state.selectedMonth}&page=1&limit=10000`;
    if (state.selectedBU) url += `&unidad=${encodeURIComponent(state.selectedBU)}`;
    if (state.selectedService) url += `&servicio=${state.selectedService}`;
    if (state.searchText) url += `&search=${encodeURIComponent(state.searchText)}`;
    
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar datos para exportación.');
    const data = await response.json();
    
    if (data.rows.length === 0) {
      showToast('Exportación vacía', 'warning', 'No hay datos en la vista actual para exportar.');
      return;
    }
    
    // Build CSV Content
    // Columns: Servicio, N° Casa, N° Máquina, Máquina, Marca, Modelo, Fecha Ingreso, Potencia (W), Hs/Día, Cálculo (Wh)
    const headers = ['Nombre Servicio', 'Nro Casa', 'Nro Maquina', 'Maquina', 'Marca', 'Modelo', 'Fecha Incorporacion', 'Potencia (W)', 'Hs/Dia', 'Calculo (Wh/Dia)', 'Consumo (kWh/Mes)', 'Unidad Negocio'];

    const diasDelMesExport = getDiasDelMes(state.selectedMonth);
    
    let csvContent = '\uFEFF'; // UTF-8 BOM to display accented letters correctly in Excel
    csvContent += headers.join(';') + '\r\n'; // Excel uses semicolon in Spanish locales
    
    data.rows.forEach(row => {
      const consumoMes = (row.calculo * diasDelMesExport) / 1000;
      const line = [
        `"${(row.nombre_servicio || '').replace(/"/g, '""')}"`,
        row.nro_casa,
        row.nro_maquina,
        `"${(row.maquina || '').replace(/"/g, '""')}"`,
        `"${(row.marca || '').replace(/"/g, '""')}"`,
        `"${(row.modelo || '').replace(/"/g, '""')}"`,
        row.fecha_incorporacion || '',
        row.potencia,
        row.hs_dia,
        row.calculo,
        consumoMes.toFixed(2),
        `"${row.unidad_negocio}"`
      ];
      csvContent += line.join(';') + '\r\n';
    });
    
    // Download File
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const urlBlob = URL.createObjectURL(blob);
    
    const buSuffix = state.selectedBU ? `_${state.selectedBU.split(' ')[0]}` : '';
    const svcSuffix = state.selectedService ? `_Svc${state.selectedService}` : '';
    link.setAttribute('href', urlBlob);
    link.setAttribute('download', `Consumo_Electrico_${state.selectedMonth}${buSuffix}${svcSuffix}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exportación completada', 'success', 'Se descargó el archivo CSV filtrado.');
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// Export Excel (Since Excel client usually wants a CSV or native file, we'll download CSV which Excel opens natively)
function exportDataToExcel() {
  exportDataToCSV();
}

// --- CHART RENDER HELPERS ---
function renderTrendChart(data) {
  const ctx = document.getElementById('chart-trend').getContext('2d');
  
  if (state.charts.trend) {
    state.charts.trend.destroy();
  }
  
  const labels = data.map(d => {
    const [year, month] = d.mes.split('-');
    const shortMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${shortMonths[parseInt(month) - 1]} ${year}`;
  });
  
  const limpioluxValues = data.map(d => d['Limpiolux S.A.']);
  const ceilingValues = data.map(d => d['Ceiling Solution S.A.']);
  
  state.charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Limpiolux S.A.',
          data: limpioluxValues,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.05)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#06b6d4'
        },
        {
          label: 'Ceiling Solution S.A.',
          data: ceilingValues,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#8b5cf6'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#f3f4f6', font: { family: 'Inter', size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.raw.toFixed(1)} kWh/mes`;
            }
          }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Inter' } },
          title: { display: true, text: 'Consumo (kWh)', color: '#9ca3af' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { family: 'Inter' } }
        }
      }
    }
  });
}

function renderMachinesChart(data) {
  const canvas = document.getElementById('chart-machines');
  const ctx = canvas.getContext('2d');

  if (state.charts.machines) {
    state.charts.machines.destroy();
  }

  if (data.length === 0) {
    return;
  }

  const labels = data.map(d => d.name);
  const values = data.map(d => d.value);

  // Un color distinto por barra (rueda HSL) para diferenciar todos los tipos
  const barColors = data.map((_, i) => `hsl(${Math.round((i * 360) / data.length)}, 65%, 55%)`);

  // Altura dinámica: ~26px por barra, para que se vean todos los tipos
  const alturaPorBarra = 26;
  const alturaMinima = 300;
  const alturaCanvas = Math.max(alturaMinima, data.length * alturaPorBarra + 40);
  const contenedor = canvas.parentElement;
  if (contenedor) contenedor.style.height = alturaCanvas + 'px';

  state.charts.machines = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Consumo (kWh/mes)',
        data: values,
        backgroundColor: barColors,
        borderWidth: 0,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y', // barras horizontales
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.raw.toFixed(1)} kWh/mes`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Inter' } },
          title: { display: true, text: 'Consumo (kWh/mes)', color: '#9ca3af' }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#f3f4f6', font: { family: 'Inter', size: 11 }, autoSkip: false }
        }
      }
    }
  });
}

function renderServicesChart(data) {
  const ctx = document.getElementById('chart-services').getContext('2d');
  
  if (state.charts.services) {
    state.charts.services.destroy();
  }
  
  if (data.length === 0) {
    return;
  }
  
  const labels = data.map(d => d.name.length > 25 ? d.name.slice(0, 25) + '...' : d.name);
  const values = data.map(d => d.value);
  
  state.charts.services = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Consumo kWh',
        data: values,
        backgroundColor: 'rgba(59, 130, 246, 0.75)',
        hoverBackgroundColor: 'rgba(59, 130, 246, 0.95)',
        borderRadius: 4,
        borderWidth: 0
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` Consumo: ${context.raw.toFixed(1)} kWh/mes`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af' }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 11 } }
        }
      }
    }
  });
}

// --- TOAST NOTIFICATIONS ---
function showToast(title, type = 'info', message = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    info: 'fa-info-circle text-primary',
    success: 'fa-check-circle text-success',
    error: 'fa-times-circle',
    warning: 'fa-exclamation-triangle'
  };
  
  if (type === 'error') {
    toast.style.borderLeftColor = 'var(--red)';
  } else if (type === 'warning') {
    toast.style.borderLeftColor = 'var(--yellow)';
  }
  
  const iconClass = icons[type] || 'fa-info-circle';
  const colorStyle = type === 'error' ? 'color: var(--red);' : type === 'warning' ? 'color: var(--yellow);' : '';
  
  toast.innerHTML = `
    <i class="fa-solid ${iconClass}" style="${colorStyle} font-size: 20px;"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
  `;
  
  container.appendChild(toast);
  
  // Slide out and remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}



// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
let assignTargetUserId = null;
let allServicesForModal = [];

async function fetchUsers() {
  try {
    const res = await fetch(`${API_BASE}/usuarios`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('No autorizado o error al cargar usuarios.');
    const users = await res.json();
    const grid = document.getElementById('users-grid');
    grid.innerHTML = '';

    users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.innerHTML = `
        <div class="user-card-header">
          <div class="user-card-avatar ${u.role === 'admin' ? 'role-admin' : ''}">${u.nombre.charAt(0).toUpperCase()}</div>
          <div>
            <div class="user-card-name">${u.nombre}</div>
            <div class="user-card-username">@${u.username}</div>
          </div>
        </div>
        <span class="role-badge ${u.role}">${u.role === 'admin' ? '🔑 Administrador' : '👤 Supervisor'}</span>
        ${!u.activo ? '<span class="role-badge" style="background:var(--red); color:white; margin-left: 5px;">Inactivo</span>' : ''}
        <div class="user-card-actions" style="flex-wrap: wrap; margin-top: 10px;">
          ${u.role !== 'admin' ? `<button type="button" class="btn-assign" onclick="event.stopPropagation(); openAssignModal(${u.id}, '${u.nombre}')" title="Asignar Servicios"><i class="fa-solid fa-handshake-angle"></i></button>` : ''}
          <button type="button" class="btn-assign" onclick="event.stopPropagation(); openPasswordModal(${u.id}, '${u.nombre}')" title="Cambiar Contraseña" style="background: var(--blue);"><i class="fa-solid fa-key"></i></button>
          ${u.id !== state.currentUser?.id ? `<button type="button" class="btn-assign" onclick="event.stopPropagation(); toggleUserStatus(${u.id}, ${u.activo}, '${u.nombre}')" title="${u.activo ? 'Desactivar' : 'Activar'}" style="background: ${u.activo ? 'var(--orange)' : 'var(--green)'};"><i class="fa-solid ${u.activo ? 'fa-user-slash' : 'fa-user-check'}"></i></button>` : ''}
          ${u.id !== state.currentUser?.id ? `<button type="button" class="btn-del-user" onclick="event.stopPropagation(); deleteUser(${u.id}, '${u.nombre}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

async function createUser() {
  const nombre = document.getElementById('new-user-nombre').value.trim();
  const username = document.getElementById('new-user-username').value.trim();
  const password = document.getElementById('new-user-password').value;
  const role = document.getElementById('new-user-role').value;

  if (!nombre || !username || !password) {
    showToast('Campos incompletos', 'warning', 'Complete todos los campos para crear el usuario.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/usuarios`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ nombre, username, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Usuario creado', 'success', `El usuario "${username}" fue creado exitosamente.`);
    document.getElementById('new-user-nombre').value = '';
    document.getElementById('new-user-username').value = '';
    document.getElementById('new-user-password').value = '';
    fetchUsers();
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

async function deleteUser(id, nombre) {
  if (!confirm(`¿Está seguro que desea eliminar al usuario "${nombre}"?`)) return;
  try {
    const res = await fetch(`${API_BASE}/usuarios/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Usuario eliminado', 'success', `El usuario "${nombre}" fue eliminado.`);
    fetchUsers();
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

async function toggleUserStatus(id, currentStatus, nombre) {
  const newStatus = currentStatus ? 0 : 1;
  const actionText = currentStatus ? 'desactivar' : 'activar';
  if (!confirm(`¿Está seguro que desea ${actionText} al usuario "${nombre}"?`)) return;
  
  try {
    const res = await fetch(`${API_BASE}/usuarios/${id}/activo`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ activo: newStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Estado actualizado', 'success', `El usuario "${nombre}" fue ${currentStatus ? 'desactivado' : 'activado'}.`);
    fetchUsers();
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

let passwordTargetUserId = null;

function openPasswordModal(id, nombre) {
  passwordTargetUserId = id;
  document.getElementById('pwd-modal-username').textContent = nombre;
  document.getElementById('new-pwd-input').value = '';
  document.getElementById('change-password-modal').classList.add('active');
}

function closePasswordModal() {
  document.getElementById('change-password-modal').classList.remove('active');
  passwordTargetUserId = null;
}

async function savePassword() {
  const password = document.getElementById('new-pwd-input').value;
  if (!password) {
    showToast('Contraseña vacía', 'warning', 'Debe ingresar una nueva contraseña.');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/usuarios/${passwordTargetUserId}/password`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Contraseña actualizada', 'success', 'La contraseña fue cambiada exitosamente.');
    closePasswordModal();
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

async function openAssignModal(userId, nombre) {
  try {
    assignTargetUserId = userId;
    document.getElementById('assign-modal-username').textContent = nombre;
    document.getElementById('svc-modal-search').value = '';

    // Load all services and currently assigned
    const [allRes, assignedRes] = await Promise.all([
      fetch(`${API_BASE}/servicios`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE}/usuarios/${userId}/servicios`, { headers: getAuthHeaders() })
    ]);
    const allSvcs = await allRes.json();
    const assignedSvcs = await assignedRes.json();
    
    if (!Array.isArray(allSvcs)) throw new Error('Error al cargar la lista de servicios');
    if (!Array.isArray(assignedSvcs)) throw new Error('Error al cargar los servicios asignados');

    const assignedCasas = new Set(assignedSvcs.map(s => parseInt(s.nro_casa)));

    allServicesForModal = allSvcs;
    renderServiceChecklist(allSvcs, assignedCasas);
    document.getElementById('assign-services-modal').classList.add('active');
  } catch (error) {
    console.error('openAssignModal error:', error);
    showToast('Error', 'error', 'Error al abrir asignación: ' + error.message);
  }
}

function renderServiceChecklist(services, assignedCasas) {
  const list = document.getElementById('services-checklist');
  list.innerHTML = '';
  services.forEach(s => {
    const item = document.createElement('div');
    item.className = 'service-check-item';
    item.dataset.casa = s.nro_casa;
    item.dataset.name = (s.nombre_servicio || '').toLowerCase();
    item.innerHTML = `
      <input type="checkbox" id="svc-${s.nro_casa}" value="${s.nro_casa}" ${assignedCasas.has(s.nro_casa) ? 'checked' : ''} />
      <label for="svc-${s.nro_casa}">${s.nombre_servicio || `Casa ${s.nro_casa}`}</label>
    `;
    list.appendChild(item);
  });
}

function filterModalServices(text) {
  const items = document.querySelectorAll('.service-check-item');
  items.forEach(item => {
    item.style.display = item.dataset.name.includes(text.toLowerCase()) ? '' : 'none';
  });
}

async function saveAssignedServices() {
  const checked = document.querySelectorAll('#services-checklist input[type="checkbox"]:checked');
  const casas = Array.from(checked).map(c => parseInt(c.value));
  try {
    const res = await fetch(`${API_BASE}/usuarios/${assignTargetUserId}/servicios`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ casas })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Asignación guardada', 'success', `${casas.length} servicio(s) asignados correctamente.`);
    closeAssignModal();
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

function closeAssignModal() {
  document.getElementById('assign-services-modal').classList.remove('active');
  assignTargetUserId = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPERVISOR HOURS ACCORDION
// ═══════════════════════════════════════════════════════════════════════════
async function fetchHorasAccordion() {
  if (!state.selectedMonth) return;
  const container = document.getElementById('horas-accordion');
  container.innerHTML = '<p style="color:var(--text-dim);">Cargando servicios...</p>';

  try {
    // Load services for this user/month
    const svcRes = await fetch(`${API_BASE}/servicios?mes=${state.selectedMonth}`, { headers: getAuthHeaders() });
    const services = await svcRes.json();

    // Load existing closures for this month
    const closureRes = await fetch(`${API_BASE}/cierres?mes=${state.selectedMonth}`, { headers: getAuthHeaders() });
    const closures = await closureRes.json();
    const closedMap = {};
    closures.forEach(c => { closedMap[c.nro_casa] = c; });

    if (services.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);">No tiene servicios asignados para este período.</p>';
      return;
    }

    container.innerHTML = '';
    services.forEach(svc => {
      const isClosed = !!closedMap[svc.nro_casa];
      const cierre = closedMap[svc.nro_casa];
      const item = document.createElement('div');
      item.className = `service-accordion-item${isClosed ? ' is-closed' : ''}`;
      item.id = `acc-item-${svc.nro_casa}`;
      item.innerHTML = `
        <div class="accordion-header" onclick="toggleAccordion(${svc.nro_casa})">
          <i class="fa-solid fa-building" style="color:var(--primary); font-size:14px;"></i>
          <span class="acc-casa-badge">N° ${svc.nro_casa}</span>
          <span class="acc-name">${svc.nombre_servicio || `Casa ${svc.nro_casa}`}</span>
          ${isClosed
            ? `<span class="closed-badge"><i class="fa-solid fa-lock"></i> Cerrado ${new Date(cierre.fecha_cierre).toLocaleDateString('es-AR')}</span>
               <button class="btn-view-photo" onclick="event.stopPropagation(); viewAuditPhoto('${cierre.foto_auditoria}', '${svc.nombre_servicio}', '${new Date(cierre.fecha_cierre).toLocaleDateString('es-AR')}')">
                 <i class="fa-regular fa-image"></i> Ver Foto
               </button>`
            : '<i class="fa-solid fa-chevron-down acc-arrow"></i>'
          }
        </div>
        <div class="accordion-item-body" id="acc-body-${svc.nro_casa}">
          <div id="acc-table-${svc.nro_casa}"><p style="padding:16px; color:var(--text-dim);">Cargando...</p></div>
          <div class="accordion-footer">
            <span style="font-size:12px; color:var(--text-muted);">Total: <strong id="acc-total-${svc.nro_casa}">0 Wh/día</strong></span>
            <div style="display:flex; gap:10px;">
              ${!isClosed ? `
                <button class="btn-save-hours" onclick="saveHours(${svc.nro_casa})">
                  <i class="fa-solid fa-floppy-disk"></i> Guardar Horas
                </button>
                <button class="btn-close-period" onclick="openClosureModal(${svc.nro_casa})">
                  <i class="fa-solid fa-lock"></i> Cerrar Período
                </button>
              ` : `
                <button class="btn-view-photo" onclick="viewAuditPhoto('${cierre.foto_auditoria}', '${svc.nombre_servicio}', '${new Date(cierre.fecha_cierre).toLocaleDateString('es-AR')}')">
                  <i class="fa-regular fa-image"></i> Ver Foto de Auditoría
                </button>
              `}
            </div>
          </div>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (error) {
    container.innerHTML = `<p style="color:var(--red);">Error: ${error.message}</p>`;
  }
}

async function toggleAccordion(nroCasa) {
  const item = document.getElementById(`acc-item-${nroCasa}`);
  const body = document.getElementById(`acc-body-${nroCasa}`);
  if (!body) return;

  const isOpen = body.classList.contains('open');
  // Close all first
  document.querySelectorAll('.accordion-item-body.open').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.service-accordion-item.open').forEach(i => i.classList.remove('open'));

  if (!isOpen) {
    item.classList.add('open');
    body.classList.add('open');
    // Load machine data for this service
    await loadMachinesForService(nroCasa, state.selectedMonth);
  }
}

async function loadMachinesForService(nroCasa, mes) {
  const tableDiv = document.getElementById(`acc-table-${nroCasa}`);
  const totalSpan = document.getElementById(`acc-total-${nroCasa}`);
  try {
    const res = await fetch(`${API_BASE}/horas/${mes}/${nroCasa}`, { headers: getAuthHeaders() });
    const rows = await res.json();

    // Check if service is closed
    const closureRes = await fetch(`${API_BASE}/cierres?mes=${mes}`, { headers: getAuthHeaders() });
    const closures = await closureRes.json();
    const isClosed = closures.some(c => c.nro_casa == nroCasa);

    let total = rows.reduce((a, r) => a + r.calculo, 0);
    if (totalSpan) totalSpan.textContent = `${total.toFixed(1)} Wh/día`;

    tableDiv.innerHTML = `
      <table class="hours-table">
        <thead>
          <tr>
            <th>N° Máq.</th><th>Máquina</th><th>Marca</th><th>Potencia (W)</th>
            <th>Hs/Día</th><th>Cálculo (Wh)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.nro_maquina}</strong></td>
              <td>${r.maquina}</td>
              <td>${r.marca || '-'}</td>
              <td>${r.potencia.toFixed(1)}</td>
              <td>
                <input type="number" class="hs-input" 
                  data-id="${r.id}" 
                  value="${r.hs_dia.toFixed(2)}" 
                  min="0" max="24" step="0.1"
                  ${isClosed ? 'disabled' : ''}
                  oninput="updateHsTotal(${nroCasa})"
                />
              </td>
              <td>${r.calculo.toFixed(1)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    tableDiv.innerHTML = `<p style="padding:16px; color:var(--red);">Error: ${error.message}</p>`;
  }
}

function updateHsTotal(nroCasa) {
  const inputs = document.querySelectorAll(`#acc-table-${nroCasa} .hs-input`);
  // We can't easily recalculate without potencia here, just show count changed
  const totalSpan = document.getElementById(`acc-total-${nroCasa}`);
  if (totalSpan) totalSpan.textContent = '(modificado - guarde para actualizar)';
}

async function saveHours(nroCasa) {
  const inputs = document.querySelectorAll(`#acc-table-${nroCasa} .hs-input`);
  const items = Array.from(inputs).map(inp => ({ id: parseInt(inp.dataset.id), hs_dia: parseFloat(inp.value) || 0 }));

  try {
    const res = await fetch(`${API_BASE}/horas`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ mes: state.selectedMonth, nro_casa: nroCasa, items })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Horas guardadas', 'success', data.message);
    // Reload the table
    await loadMachinesForService(nroCasa, state.selectedMonth);
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLOSURE MODAL
// ═══════════════════════════════════════════════════════════════════════════
function openClosureModal(nroCasa) {
  document.getElementById('closure-nro-casa').value = nroCasa;
  document.getElementById('closure-photo-input').value = '';
  document.getElementById('photo-preview').style.display = 'none';
  document.getElementById('photo-preview').src = '';
  document.getElementById('closure-modal').classList.add('active');
}

function closeClosureModal() {
  document.getElementById('closure-modal').classList.remove('active');
}

function previewPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('photo-preview');
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function submitClosure() {
  const nroCasa = document.getElementById('closure-nro-casa').value;
  const photoInput = document.getElementById('closure-photo-input');

  if (!photoInput.files[0]) {
    showToast('Foto requerida', 'warning', 'Debe adjuntar una foto de auditoría para cerrar el período.');
    return;
  }

  const formData = new FormData();
  formData.append('mes', state.selectedMonth);
  formData.append('nro_casa', nroCasa);
  formData.append('foto', photoInput.files[0]);

  try {
    const res = await fetch(`${API_BASE}/cierres`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }, // No Content-Type for FormData
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Período cerrado', 'success', 'El consumo del servicio fue cerrado exitosamente para auditoría.');
    closeClosureModal();
    fetchHorasAccordion(); // Refresh accordion
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT PHOTO VIEWER
// ═══════════════════════════════════════════════════════════════════════════
function viewAuditPhoto(filename, serviceName, fecha) {
  const modal = document.getElementById('photo-viewer-modal');
  document.getElementById('audit-photo-img').src = `/uploads/cierres/${filename}`;
  document.getElementById('audit-photo-meta').textContent = `${serviceName} — Cerrado el ${fecha}`;
  modal.classList.add('active');
}

// Drag-and-drop support for closure upload zone
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('closure-upload-zone');
  if (!zone) return;
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const input = document.getElementById('closure-photo-input');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      previewPhoto(input);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

const auditState = {
  currentPage: 1,
  limit: 50,
  total: 0
};

async function loadAuditLog() {
  if (state.currentUser.role !== 'admin') {
    showToast('Error', 'error', 'Solo administradores pueden ver el audit log.');
    return;
  }

  try {
    const tipo = document.getElementById('audit-filter-tipo')?.value || '';
    const tabla = document.getElementById('audit-filter-tabla')?.value || '';
    const usuario = document.getElementById('audit-search-usuario')?.value || '';

    let url = `${API_BASE}/audit-log?page=${auditState.currentPage}&limit=${auditState.limit}`;
    if (tipo) url += `&tipo=${encodeURIComponent(tipo)}`;
    if (tabla) url += `&tabla=${encodeURIComponent(tabla)}`;
    if (usuario) url += `&usuario=${encodeURIComponent(usuario)}`;

    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Error al cargar audit log.');
    const data = await response.json();

    renderAuditLog(data.rows);
    renderAuditPagination(data.total, data.page, data.totalPages);
    auditState.total = data.total;
  } catch (error) {
    showToast('Error', 'error', error.message);
  }
}

function renderAuditLog(rows) {
  const tbody = document.getElementById('audit-body');
  tbody.innerHTML = '';

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-dim);">No hay registros de auditoría.</td></tr>';
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement('tr');
    const fecha = new Date(row.fecha_cambio).toLocaleDateString('es-AR') + ' ' + new Date(row.fecha_cambio).toLocaleTimeString('es-AR');

    tr.innerHTML = `
      <td><small>${fecha}</small></td>
      <td>${row.nombre_usuario || '-'}</td>
      <td><span class="badge badge-${row.tipo_operacion.toLowerCase()}">${row.tipo_operacion}</span></td>
      <td><code>${row.tabla_afectada || '-'}</code></td>
      <td>${row.registro_id || '-'}</td>
      <td>${row.descripcion || '-'}</td>
      <td><code class="code-small">${row.valor_anterior || '-'}</code></td>
      <td><code class="code-small">${row.valor_nuevo || '-'}</code></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAuditPagination(total, page, totalPages) {
  document.getElementById('audit-pag-total').textContent = total.toLocaleString();
  const start = Math.min((page - 1) * auditState.limit + 1, total);
  const end = Math.min(page * auditState.limit, total);
  document.getElementById('audit-pag-start').textContent = start;
  document.getElementById('audit-pag-end').textContent = end;

  const pagesEl = document.getElementById('audit-pag-numbers');
  pagesEl.innerHTML = '';
  for (let i = 1; i <= Math.min(totalPages, 5); i++) {
    const btn = document.createElement('button');
    btn.className = `pag-btn ${i === page ? 'active' : ''}`;
    btn.textContent = i;
    btn.onclick = () => {
      auditState.currentPage = i;
      loadAuditLog();
    };
    pagesEl.appendChild(btn);
  }
}

function filterAuditLog() {
  auditState.currentPage = 1;
  loadAuditLog();
}

function auditPrevPage() {
  if (auditState.currentPage > 1) {
    auditState.currentPage--;
    loadAuditLog();
  }
}

function auditNextPage() {
  if (auditState.currentPage * auditState.limit < auditState.total) {
    auditState.currentPage++;
    loadAuditLog();
  }
}

function exportAuditLog() {
  const tipo = document.getElementById('audit-filter-tipo')?.value || '';
  const tabla = document.getElementById('audit-filter-tabla')?.value || '';
  const usuario = document.getElementById('audit-search-usuario')?.value || '';

  const rows = Array.from(document.querySelectorAll('#audit-body tr'));
  const headers = ['Fecha/Hora', 'Usuario', 'Operación', 'Tabla', 'ID Registro', 'Descripción', 'Valor Anterior', 'Valor Nuevo'];

  let csv = headers.join(',') + '\n';
  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll('td')).map(td => {
      let text = td.textContent.trim();
      text = text.replace(/"/g, '""');
      return `"${text}"`;
    });
    csv += cells.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Load audit log when tab is switched
const originalSwitchTab = window.switchTab;
window.switchTab = function(tabName) {
  originalSwitchTab(tabName);
  if (tabName === 'audit' && state.currentUser?.role === 'admin') {
    loadAuditLog();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FILTER DISPLAY UPDATE
// ═══════════════════════════════════════════════════════════════════════════

function updateFilterDisplay() {
  // Update Período (from header selector)
  const selectMonth = document.getElementById('select-month-header');
  const displayPeriodo = document.getElementById('display-periodo');
  if (selectMonth && displayPeriodo) {
    const selectedOption = selectMonth.options[selectMonth.selectedIndex];
    displayPeriodo.textContent = selectedOption?.text || 'Sin período';
  }

  // Update Unidad (from header selector)
  const selectBU = document.getElementById('select-bu-header');
  const displayUnidad = document.getElementById('display-unidad');
  if (selectBU && displayUnidad) {
    const selectedOption = selectBU.options[selectBU.selectedIndex];
    displayUnidad.textContent = selectedOption?.text || 'Todas las Unidades';
  }
}
