// js/barberProfile.js
const SUPABASE_URL = 'https://ktoboiohgwsdjdggjdyo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0b2JvaW9oZ3dzZGpkZ2dqZHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgyMjM1OTAsImV4cCI6MjA2Mzc5OTU5MH0.Rs1F3p9h9BacH1Vd2MyoqErzVKI_do2zYHy2bAIDUvw';

let supabaseClient;
let currentUserId = null;
let masterServices = [];

// Variables globales para el calendario y la disponibilidad
let currentCalendarDate = new Date();
let weeklyAvailabilityData = [[], [], [], [], [], [], []];
let activeEditingDayIndex = -1;
let monthlyBookingsMap = new Map(); // Para marcar días con citas

const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const monthsOfYear = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// --- Elementos del DOM ---
// Contenedores de secciones principales
const profileContent = document.getElementById('profile-content');
const servicesSection = document.getElementById('services-section');
const bookingLinkContainer = document.getElementById('booking-link-container');
// Botones principales
const logoutProfileButton = document.getElementById('logout-profile-button');
const saveAllButton = document.getElementById('save-all-profile-btn');
const saveStatus = document.getElementById('save-status');
const addOtherServiceButton = document.getElementById('add-other-service-btn');

// Elementos del Calendario
const calendarDaysGrid = document.getElementById('calendar-days-grid');
const calCurrentMonthYear = document.getElementById('cal-current-month-year');
const calPrevMonthBtn = document.getElementById('cal-prev-month-btn');
const calNextMonthBtn = document.getElementById('cal-next-month-btn');

// Elementos del Editor de Disponibilidad
const availabilityDayEditor = document.getElementById('availability-day-editor');
const editingDayTitleSpan = document.querySelector('#editing-day-title span');
const selectedDaySlotsContainer = document.getElementById('selected-day-slots-container');
const addSlotToSelectedDayBtn = document.getElementById('add-slot-to-selected-day-btn');

// --- NUEVO: Elementos de Gestión de Reservas ---
const selectedDayHeading = document.getElementById('selected-day-heading');
const bookingsList = document.getElementById('bookings-list');

// --- NUEVO: Lógica de Navegación del Dashboard ---
function setupDashboardNavigation() {
    const menuLinks = document.querySelectorAll('.menu-link');
    const contentSections = document.querySelectorAll('.content-section');

    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');

            // Actualizar menú
            menuLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Actualizar contenido
            contentSections.forEach(section => {
                if (section.id === targetId) {
                    section.classList.add('active');
                } else {
                    section.classList.remove('active');
                }
            });

            // Cargar datos si es la primera vez que se visita la sección
            if (targetId === 'dashboard' && !link.dataset.loaded) {
                loadDashboardStats();
                link.dataset.loaded = true;
            }
        });
    });
}


// --- INICIALIZACIÓN ---
const initSupabaseInProfile = () => {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Cliente Supabase inicializado ✅");

        loadInitialData(); // Carga todo lo necesario al inicio

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') window.location.href = 'login_register.html';
        });
    } else {
        console.warn("Supabase CDN no cargado. Reintentando... ⏳");
        setTimeout(initSupabaseInProfile, 200);
    }
};

// --- LÓGICA DE CARGA DE DATOS ---

async function loadInitialData() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { window.location.href = 'login_register.html'; return; }
    currentUserId = user.id;

    if (saveStatus) saveStatus.textContent = "Cargando datos...";
    try {
        const [barberRes, masterServicesRes, barberServicesRes, availabilityRes] = await Promise.all([
            supabaseClient.from('barberos').select('*').eq('user_id', currentUserId).single(),
            supabaseClient.from('servicios_maestro').select('*').order('nombre'),
            supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId),
            supabaseClient.from('disponibilidad').select('*').eq('barbero_id', currentUserId).order('dia_semana').order('hora_inicio')
        ]);

        if (barberRes.error && barberRes.error.code !== 'PGRST116') throw new Error(`Perfil: ${barberRes.error.message}`);
        if (masterServicesRes.error) throw new Error(`Servicios Maestros: ${masterServicesRes.error.message}`);
        if (barberServicesRes.error) throw new Error(`Servicios Barbero: ${barberServicesRes.error.message}`);
        if (availabilityRes.error) throw new Error(`Disponibilidad: ${availabilityRes.error.message}`);

        masterServices = masterServicesRes.data || [];

        // Inicializar datos de disponibilidad
        weeklyAvailabilityData = [[], [], [], [], [], [], []];
        (availabilityRes.data || []).forEach(slot => {
            if (slot.dia_semana >= 0 && slot.dia_semana <= 6) {
                weeklyAvailabilityData[slot.dia_semana].push({
                    id: slot.id,
                    hora_inicio: slot.hora_inicio.substring(0, 5),
                    hora_fin: slot.hora_fin.substring(0, 5)
                });
            }
        });

        // Renderizar componentes estáticos
        renderBarberForm(barberRes.data);
        renderServices(barberServicesRes.data || []);
        renderBookingLink(currentUserId);

        // Configurar UI
        setupEventListeners();
        setupDashboardNavigation();
        initCalendar(); // Carga el calendario inicial

        // Cargar datos del panel de control por defecto
        loadDashboardStats();
        document.querySelector('.menu-link[data-target="dashboard"]').dataset.loaded = true;


        if (saveStatus) saveStatus.textContent = "";

    } catch (error) {
        console.error('Error cargando datos iniciales:', error);
        if (saveStatus) saveStatus.textContent = `Error al cargar: ${error.message}`;
    }
}

// --- NUEVO: Cargar Estadísticas del Panel de Control ---
async function loadDashboardStats() {
    const loadingStatus = document.getElementById('dashboard-loading-status');
    const statsGrid = document.getElementById('dashboard-stats-grid');
    loadingStatus.style.display = 'block';
    statsGrid.style.display = 'none';

    if (!currentUserId) return;

    try {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

        // 1. Reservas activas (a partir de hoy)
        const { count: activeBookings, error: bookingsError } = await supabaseClient
            .from('citas')
            .select('*', { count: 'exact', head: true })
            .eq('barbero_id', currentUserId)
            .gte('fecha_cita', today.toISOString().split('T')[0]);
        if (bookingsError) throw bookingsError;

        // 2. Clientes únicos (usando RPC)
        const { data: uniqueClients, error: clientsError } = await supabaseClient.rpc('count_unique_clients_for_barber', { barber_uuid: currentUserId });
        if (clientsError) throw clientsError;

        // 3. Ingresos del mes actual
        const { data: monthlyIncomeData, error: incomeError } = await supabaseClient
            .from('citas')
            .select('precio_final')
            .eq('barbero_id', currentUserId)
            .gte('fecha_cita', firstDayOfMonth);
        if (incomeError) throw incomeError;
        const monthlyIncome = monthlyIncomeData.reduce((sum, item) => sum + (item.precio_final || 0), 0);

        // Actualizar UI
        document.getElementById('stat-active-bookings').textContent = activeBookings;
        document.getElementById('stat-unique-clients').textContent = uniqueClients;
        document.getElementById('stat-monthly-income').textContent = `$${monthlyIncome.toFixed(2)}`;

        loadingStatus.style.display = 'none';
        statsGrid.style.display = 'grid';

    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        loadingStatus.textContent = `Error al cargar estadísticas: ${error.message}`;
    }
}


// --- LÓGICA DEL CALENDARIO (MODIFICADA) ---
function initCalendar() {
    if (calPrevMonthBtn) calPrevMonthBtn.addEventListener('click', () => changeMonth(-1));
    if (calNextMonthBtn) calNextMonthBtn.addEventListener('click', () => changeMonth(1));
    fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
}

async function fetchBookingsForMonth(year, month) {
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data, error } = await supabaseClient
        .from('citas')
        .select('fecha_cita')
        .eq('barbero_id', currentUserId)
        .gte('fecha_cita', firstDay)
        .lte('fecha_cita', lastDay);

    if (error) {
        console.error("Error cargando reservas del mes:", error);
        return;
    }

    monthlyBookingsMap.clear();
    data.forEach(booking => {
        monthlyBookingsMap.set(booking.fecha_cita, true);
    });

    renderCalendar(year, month);
}

function changeMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    fetchBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
}

function renderCalendar(year, month) {
    if (!calendarDaysGrid || !calCurrentMonthYear) return;

    calendarDaysGrid.innerHTML = '';
    calCurrentMonthYear.textContent = `${monthsOfYear[month]} ${year}`;

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const firstDayOfWeek = firstDayOfMonth.getDay();

    let currentWeekRow = document.createElement('div');
    currentWeekRow.className = 'calendar-week-row';

    for (let i = 0; i < firstDayOfWeek; i++) {
        const daySpan = document.createElement('span');
        daySpan.className = 'calendar-day other-month';
        currentWeekRow.appendChild(daySpan);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        if ((firstDayOfWeek + day - 1) % 7 === 0 && currentWeekRow.children.length > 0) {
            calendarDaysGrid.appendChild(currentWeekRow);
            currentWeekRow = document.createElement('div');
            currentWeekRow.className = 'calendar-week-row';
        }

        const daySpan = document.createElement('span');
        daySpan.className = 'calendar-day';
        daySpan.textContent = day;
        const currentDateObj = new Date(year, month, day);
        const dateString = currentDateObj.toISOString().split('T')[0];
        daySpan.dataset.date = dateString;
        daySpan.dataset.dayOfWeek = currentDateObj.getDay();

        const today = new Date();
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            daySpan.classList.add('today');
        }

        // NUEVO: Marcar días con reservas
        if (monthlyBookingsMap.has(dateString)) {
            daySpan.classList.add('has-bookings');
        }

        daySpan.addEventListener('click', (e) => handleCalendarDayClick(e, dateString, currentDateObj.getDay()));
        currentWeekRow.appendChild(daySpan);
    }

    const remainingCells = 7 - (currentWeekRow.children.length % 7);
    if (currentWeekRow.children.length > 0 && remainingCells < 7) {
        for (let i = 0; i < remainingCells; i++) {
            const daySpan = document.createElement('span');
            daySpan.className = 'calendar-day other-month';
            currentWeekRow.appendChild(daySpan);
        }
    }
    if (currentWeekRow.children.length > 0) {
        calendarDaysGrid.appendChild(currentWeekRow);
    }
}

// --- LÓGICA DE GESTIÓN DE RESERVAS (MODIFICADA Y NUEVA) ---

function handleCalendarDayClick(event, dateString, dayOfWeekIndex) {
    activeEditingDayIndex = dayOfWeekIndex;

    // Actualizar visualmente el calendario
    const allDays = calendarDaysGrid.querySelectorAll('.calendar-day');
    allDays.forEach(d => d.classList.remove('selected-day'));
    if (event.target.classList.contains('calendar-day')) {
        event.target.classList.add('selected-day');
    }

    // 1. Mostrar editor de disponibilidad
    if (editingDayTitleSpan) editingDayTitleSpan.textContent = daysOfWeek[dayOfWeekIndex];
    displayAvailabilityForDay(dayOfWeekIndex);

    // 2. Cargar y mostrar las reservas para la fecha específica
    loadAndRenderBookingsForDate(dateString);
}

async function loadAndRenderBookingsForDate(dateString) {
    if (selectedDayHeading) selectedDayHeading.textContent = new Date(dateString + 'T00:00:00').toLocaleDateString('es-ES', { dateStyle: 'full' });
    if (bookingsList) bookingsList.innerHTML = 'Cargando citas...';

    const { data, error } = await supabaseClient
        .from('citas')
        .select('*, barbero_servicios(*, servicios_maestro(*))')
        .eq('barbero_id', currentUserId)
        .eq('fecha_cita', dateString)
        .order('hora_inicio_cita');

    if (error) {
        console.error("Error cargando citas del día:", error);
        if (bookingsList) bookingsList.innerHTML = `<p style="color:var(--danger-color)">Error al cargar las citas.</p>`;
        return;
    }

    renderBookingsForDay(data);
}

function renderBookingsForDay(bookings) {
    if (!bookingsList) return;

    if (bookings.length === 0) {
        bookingsList.innerHTML = '<p>No hay citas programadas para este día.</p>';
        return;
    }

    let html = '';
    bookings.forEach(booking => {
        const serviceInfo = booking.barbero_servicios;
        const serviceName = serviceInfo?.nombre_personalizado || serviceInfo?.servicios_maestro?.nombre || 'Servicio no especificado';

        html += `
            <div class="booking-item">
                <h4>${booking.hora_inicio_cita.substring(0,5)} - ${booking.hora_fin_cita.substring(0,5)}</h4>
                <p><strong>Cliente:</strong> ${booking.cliente_nombre}</p>
                <p><strong>Teléfono:</strong> ${booking.cliente_telefono || 'No provisto'}</p>
                <p><strong>Servicio:</strong> ${serviceName}</p>
                <p><strong>Estado:</strong> <span style="text-transform: capitalize;">${booking.estado}</span></p>
            </div>
        `;
    });
    bookingsList.innerHTML = html;
}

// --- RENDERIZADO (Forms, Servicios, Link) ---
function renderBarberForm(barberData) {
    if (!profileContent) return;
    profileContent.innerHTML = `
        <form id="barber-profile-form">
            <div class="input-group">
                <i class="fas fa-user"></i>
                <input type="text" id="barber-name" value="${barberData?.nombre || ''}" placeholder=" " required>
                <label for="barber-name">Nombre Completo</label>
            </div>
            <div class="input-group">
                <i class="fas fa-phone"></i>
                <input type="tel" id="barber-phone" value="${barberData?.telefono || ''}" placeholder=" " required>
                <label for="barber-phone">Teléfono (ej: 58412...)</label>
            </div>
            <div class="input-group">
                <i class="fas fa-image"></i>
                <input type="file" id="barber-photo" accept="image/*">
                <label for="barber-photo" style="top: -10px; left: 10px; font-size: 0.85em; background: var(--login-card-bg); padding: 0 5px; z-index:2;">Foto (opcional)</label>
            </div>
            <img src="${barberData?.foto_perfil_url || ''}" alt="Foto de perfil" id="current-profile-img" class="profile-img-preview" style="${barberData?.foto_perfil_url ? 'display:block;' : 'display:none;'}">
        </form>
    `;
    const photoInput = document.getElementById('barber-photo');
    if (photoInput) {
        photoInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            const imgPreview = document.getElementById('current-profile-img');
            if (file && imgPreview) {
                const reader = new FileReader();
                reader.onload = (e) => { imgPreview.src = e.target.result; imgPreview.style.display = 'block'; };
                reader.readAsDataURL(file);
            }
        });
    }
}

function renderServices(barberServices) {
    if (!servicesSection) return;
    let html = '<h3>Servicios Estándar</h3>';
    if (!masterServices || masterServices.length === 0) {
        html += '<p>No hay servicios estándar definidos.</p>';
    } else {
        masterServices.forEach(ms => {
            const existingService = barberServices.find(bs => bs.servicio_id === ms.id);
            const isChecked = !!existingService;
            const price = existingService ? existingService.precio : '';
            html += `
                <div class="service-item">
                    <input type="checkbox" id="service-${ms.id}" data-id="${ms.id}" ${isChecked ? 'checked' : ''}>
                    <label for="service-${ms.id}">${ms.nombre}</label>
                    <input type="number" placeholder="Precio" value="${price}" step="0.50" min="0" ${isChecked ? '' : 'disabled'} data-price-for="${ms.id}">
                </div>
            `;
        });
    }

    html += '<h3 style="margin-top: 20px;">Mis Servicios Personalizados</h3>';
    const customServices = barberServices.filter(bs => bs.nombre_personalizado);
    if (customServices.length === 0) {
        html += '<p>No has añadido servicios personalizados.</p>';
    } else {
        customServices.forEach(bs => {
            html += `
                <div class="service-item" data-custom-id="${bs.id}">
                    <span>${bs.nombre_personalizado} - Precio: $${bs.precio}</span>
                    <button class="remove-custom-service" data-id="${bs.id}">X</button>
                </div>
            `;
        });
    }
    servicesSection.innerHTML = html;

    servicesSection.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const priceInput = servicesSection.querySelector(`input[data-price-for="${e.target.dataset.id}"]`);
            if (priceInput) {
                priceInput.disabled = !e.target.checked;
                if (!e.target.checked) priceInput.value = '';
            }
        });
    });

    servicesSection.querySelectorAll('.remove-custom-service').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const serviceId = e.target.dataset.id;
            if (confirm('¿Seguro que quieres eliminar este servicio personalizado?')) {
                if (saveStatus) saveStatus.textContent = 'Eliminando...';
                const { error } = await supabaseClient.from('barbero_servicios').delete().eq('id', serviceId);
                if (error) { alert('Error al eliminar: ' + error.message); if (saveStatus) saveStatus.textContent = 'Error.'; }
                else {
                    if (saveStatus) saveStatus.textContent = 'Eliminado.';
                    const { data, error: errLoad } = await supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId);
                    if (errLoad) console.error("Error recargando servicios:", errLoad);
                    else renderServices(data || []);
                    setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 2000);
                }
            }
        });
    });
}

function renderBookingLink(userId) {
    if (bookingLinkContainer && userId) {
        const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        const bookingUrl = `${baseUrl}/reserva.html?barber_id=${userId}`;
        bookingLinkContainer.innerHTML = `
            <a href="${bookingUrl}" target="_blank">${bookingUrl}</a>
            <br><br>
            <button id="copy-link-btn" class="profile-action-btn" style="width:auto; padding: 8px 15px; font-size:0.9em;"><i class="fas fa-copy"></i> Copiar Enlace</button>
        `;
        const copyBtn = document.getElementById('copy-link-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(bookingUrl).then(() => {
                    alert('¡Enlace copiado al portapapeles!');
                }).catch(err => {
                    alert('Error al copiar el enlace. Cópialo manualmente.');
                    console.error('Error al copiar:', err);
                });
            });
        }
    } else if (bookingLinkContainer) {
        bookingLinkContainer.innerHTML = `<p>No se pudo generar el enlace (Falta ID de usuario).</p>`;
    }
}


// --- GESTIÓN DE DISPONIBILIDAD ---
function renderSlotInput(id, start, end) {
    const startTime = start ? start.substring(0, 5) : '09:00';
    const endTime = end ? end.substring(0, 5) : '17:00';
    return `
        <div class="time-slot" data-slot-id="${id || 'new'}">
            <input type="time" value="${startTime}">
            <span> - </span>
            <input type="time" value="${endTime}">
            <button class="remove-slot-btn" data-id="${id || 'new'}">X</button>
        </div>
    `;
}

function displayAvailabilityForDay(dayIndex) {
    if (!selectedDaySlotsContainer) return;
    selectedDaySlotsContainer.innerHTML = '';

    const slotsForDay = weeklyAvailabilityData[dayIndex] || [];
    if (slotsForDay.length === 0) {
        selectedDaySlotsContainer.innerHTML = '<p style="text-align:center; opacity:0.7;">No hay horarios definidos para este día.</p>';
    } else {
        slotsForDay.forEach(slot => {
            selectedDaySlotsContainer.innerHTML += renderSlotInput(slot.id, slot.hora_inicio, slot.hora_fin);
        });
    }
}

function handleAddSlotToSelectedDay() {
    if (activeEditingDayIndex === -1 || !selectedDaySlotsContainer) {
        alert("Por favor, selecciona un día en el calendario primero.");
        return;
    }
    const newSlotHtml = renderSlotInput(null, '09:00', '17:00');
    selectedDaySlotsContainer.insertAdjacentHTML('beforeend', newSlotHtml);
    const noSlotsMsg = selectedDaySlotsContainer.querySelector('p');
    if (noSlotsMsg) {
        noSlotsMsg.remove();
    }
    updateInMemoryAvailabilityFromUI();
}

function updateInMemoryAvailabilityFromUI() {
    if (activeEditingDayIndex === -1 || !selectedDaySlotsContainer) return;

    const currentDaySlots = [];
    const slotDivs = selectedDaySlotsContainer.querySelectorAll('.time-slot');
    slotDivs.forEach(slotDiv => {
        const inputs = slotDiv.querySelectorAll('input[type="time"]');
        const start = inputs[0].value;
        const end = inputs[1].value;
        const slotDbId = slotDiv.dataset.slotId !== 'new' ? slotDiv.dataset.slotId : null;

        if (start && end) {
            currentDaySlots.push({ id: slotDbId, hora_inicio: start, hora_fin: end });
        }
    });
    weeklyAvailabilityData[activeEditingDayIndex] = currentDaySlots;
}


// --- MANEJO DE EVENTOS ---
function setupEventListeners() {
    if (logoutProfileButton) logoutProfileButton.addEventListener('click', logout);
    if (saveAllButton) saveAllButton.addEventListener('click', saveAllChanges);
    if (addOtherServiceButton) addOtherServiceButton.addEventListener('click', addOtherService);

    if (addSlotToSelectedDayBtn) {
        addSlotToSelectedDayBtn.addEventListener('click', handleAddSlotToSelectedDay);
    }

    if (selectedDaySlotsContainer) {
        selectedDaySlotsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-slot-btn')) {
                const slotDiv = e.target.closest('.time-slot');
                if (slotDiv) {
                    slotDiv.remove();
                    updateInMemoryAvailabilityFromUI();
                    if (selectedDaySlotsContainer.children.length === 0) {
                        selectedDaySlotsContainer.innerHTML = '<p style="text-align:center; opacity:0.7;">No hay horarios definidos para este día.</p>';
                    }
                }
            }
        });
        selectedDaySlotsContainer.addEventListener('change', (e) => {
            if (e.target.matches('input[type="time"]')) {
                updateInMemoryAvailabilityFromUI();
            }
        });
    }
}

// --- ACCIONES ---
async function addOtherService() {
    const nameInput = document.getElementById('other-service-name');
    const priceInput = document.getElementById('other-service-price');
    if (!nameInput || !priceInput) return;

    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);

    if (!name || isNaN(price) || price <= 0) {
        alert('Por favor, introduce un nombre y un precio válido.'); return;
    }

    if (saveStatus) saveStatus.textContent = 'Añadiendo...';
    const { error } = await supabaseClient.from('barbero_servicios').insert({
        barbero_id: currentUserId, servicio_id: null, precio: price, nombre_personalizado: name
    });

    if (error) {
        alert('Error al añadir servicio: ' + error.message); if (saveStatus) saveStatus.textContent = 'Error.';
    } else {
        if (saveStatus) saveStatus.textContent = 'Servicio añadido.';
        nameInput.value = ''; priceInput.value = '';
        const { data, error: errLoad } = await supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId);
        if (errLoad) console.error("Error recargando servicios:", errLoad);
        else renderServices(data || []);
        setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 2000);
    }
}

async function logout() {
    if (saveStatus) saveStatus.textContent = 'Cerrando sesión...';
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('Error al cerrar sesión:', error);
        if (saveStatus) saveStatus.textContent = `Error al cerrar sesión: ${error.message}`;
    }
}

// --- GUARDADO DE CAMBIOS ---
async function saveAllChanges() {
    if (saveStatus) saveStatus.textContent = "Guardando...";
    if (saveAllButton) saveAllButton.disabled = true;

    try {
        await saveBasicProfile();
        await saveServices();
        await saveAvailability();
        if (saveStatus) saveStatus.textContent = "¡Todos los cambios guardados con éxito! ✅";

        if (activeEditingDayIndex !== -1) {
            displayAvailabilityForDay(activeEditingDayIndex);
        }
        setTimeout(() => { if (saveStatus) saveStatus.textContent = "" }, 3000);
    } catch (error) {
        console.error("Error al guardar todo:", error);
        if (saveStatus) saveStatus.textContent = `Error: ${error.message}`;
    } finally {
        if (saveAllButton) saveAllButton.disabled = false;
    }
}

async function saveBasicProfile() {
    const nombreInput = document.getElementById('barber-name');
    const telefonoInput = document.getElementById('barber-phone');
    const fotoFileInput = document.getElementById('barber-photo');
    const currentProfileImg = document.getElementById('current-profile-img');

    const nombre = nombreInput ? nombreInput.value : '';
    const telefono = telefonoInput ? telefonoInput.value : '';
    const fotoFile = fotoFileInput ? fotoFileInput.files[0] : null;
    let foto_perfil_url = currentProfileImg ? currentProfileImg.src : '';

    if (!nombre.trim()) throw new Error("El nombre del barbero no puede estar vacío.");
    if (!telefono.trim()) throw new Error("El teléfono del barbero no puede estar vacío.");

    if (fotoFile) {
        const fileExt = fotoFile.name.split('.').pop();
        const filePath = `${currentUserId}/${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('barber-photos')
            .upload(filePath, fotoFile, { cacheControl: '3600', upsert: true });
        if (uploadError) throw new Error(`Subida Foto: ${uploadError.message}`);

        const { data: urlData } = supabaseClient.storage.from('barber-photos').getPublicUrl(uploadData.path);
        foto_perfil_url = urlData.publicUrl;
    }

    const { error } = await supabaseClient
        .from('barberos')
        .update({ nombre, telefono, foto_perfil_url })
        .eq('user_id', currentUserId);
    if (error) throw new Error(`Perfil Básico: ${error.message}`);
}

async function saveServices() {
    const servicesToUpsert = [];
    const serviceIdsToKeep = [];
    const serviceCheckboxes = servicesSection.querySelectorAll('input[type="checkbox"][data-id]');

    serviceCheckboxes.forEach(cb => {
        const serviceId = cb.dataset.id;
        const priceInput = servicesSection.querySelector(`input[data-price-for="${serviceId}"]`);
        const serviceNameLabel = cb.nextElementSibling;
        const serviceName = serviceNameLabel ? serviceNameLabel.textContent.trim() : `Servicio ID ${serviceId}`;

        if (cb.checked) {
            const price = parseFloat(priceInput.value);
            if (!isNaN(price) && price >= 0) {
                servicesToUpsert.push({
                    barbero_id: currentUserId, servicio_id: serviceId, precio: price
                });
                serviceIdsToKeep.push(serviceId);
            } else {
                throw new Error(`Precio inválido para "${serviceName}". Debe ser >= 0.`);
            }
        }
    });

    const { error: deleteError } = await supabaseClient
        .from('barbero_servicios')
        .delete()
        .eq('barbero_id', currentUserId)
        .not('servicio_id', 'is', null)
        .not('servicio_id', 'in', `(${serviceIdsToKeep.join(',') || "''"})`);

    if (deleteError) {
        throw new Error(`Error actualizando servicios (borrado): ${deleteError.message}`);
    }

    if (servicesToUpsert.length > 0) {
        const { error: upsertError } = await supabaseClient
            .from('barbero_servicios')
            .upsert(servicesToUpsert, { onConflict: 'barbero_id, servicio_id', ignoreDuplicates: false });
        if (upsertError) {
            throw new Error(`Error guardando servicios (upsert): ${upsertError.message}`);
        }
    }
}

async function saveAvailability() {
    updateInMemoryAvailabilityFromUI();

    const slotsToInsert = [];
    let validationErrorMsg = null;

    weeklyAvailabilityData.forEach((daySlots, dayIndex) => {
        daySlots.forEach(slot => {
            if (validationErrorMsg) return;

            if (slot.hora_inicio && slot.hora_fin) {
                if (slot.hora_inicio < slot.hora_fin) {
                    slotsToInsert.push({
                        barbero_id: currentUserId,
                        dia_semana: dayIndex,
                        hora_inicio: slot.hora_inicio,
                        hora_fin: slot.hora_fin
                    });
                } else {
                    validationErrorMsg = `Horario inválido para ${daysOfWeek[dayIndex]}: la hora de inicio no puede ser posterior o igual a la hora de fin.`;
                }
            } else if (slot.hora_inicio || slot.hora_fin) {
                validationErrorMsg = `Horario incompleto para ${daysOfWeek[dayIndex]}. Ambas horas son requeridas.`;
            }
        });
    });

    if (validationErrorMsg) {
        throw new Error(validationErrorMsg);
    }

    const { error: deleteError } = await supabaseClient
        .from('disponibilidad')
        .delete()
        .eq('barbero_id', currentUserId);
    if (deleteError) {
        throw new Error(`Disponibilidad (Error al borrar existente): ${deleteError.message}`);
    }

    if (slotsToInsert.length > 0) {
        const { error: insertError } = await supabaseClient
            .from('disponibilidad')
            .insert(slotsToInsert);
        if (insertError) {
            throw new Error(`Disponibilidad (Error al insertar nueva): ${insertError.message}`);
        }
    }
}

// --- INICIAR ---
document.addEventListener('DOMContentLoaded', initSupabaseInProfile);
