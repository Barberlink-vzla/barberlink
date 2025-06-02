// js/barberProfile.js
const SUPABASE_URL = 'https://ktoboiohgwsdjdggjdyo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0b2JvaW9oZ3dzZGpkZ2dqZHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgyMjM1OTAsImV4cCI6MjA2Mzc5OTU5MH0.Rs1F3p9h9BacH1Vd2MyoqErzVKI_do2zYHy2bAIDUvw';

let supabaseClient;
let currentUserId = null;
let masterServices = [];

const profileContent = document.getElementById('profile-content');
const servicesSection = document.getElementById('services-section');
const availabilitySection = document.getElementById('availability-section');
const logoutProfileButton = document.getElementById('logout-profile-button');
const saveAllButton = document.getElementById('save-all-profile-btn');
const saveStatus = document.getElementById('save-status');
const addOtherServiceButton = document.getElementById('add-other-service-btn');
const bookingLinkContainer = document.getElementById('booking-link-container'); // << NUEVO

const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// --- INICIALIZACIÓN ---
const initSupabaseInProfile = () => {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Cliente Supabase inicializado ✅");
        loadFullProfile();
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') window.location.href = 'login_register.html';
        });
    } else {
        console.warn("Supabase CDN no cargado. Reintentando... ⏳");
        setTimeout(initSupabaseInProfile, 200);
    }
};

// --- CARGA DE DATOS ---
async function loadFullProfile() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { window.location.href = 'login_register.html'; return; }
    currentUserId = user.id; // << AQUÍ OBTENEMOS EL ID

    saveStatus.textContent = "Cargando datos...";
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

        renderBarberForm(barberRes.data);
        renderServices(barberServicesRes.data || []);
        renderAvailability(availabilityRes.data || []);
        renderBookingLink(currentUserId); // << LLAMAMOS A LA NUEVA FUNCIÓN

        saveStatus.textContent = "";
        setupEventListeners();

    } catch (error) {
        console.error('Error cargando perfil completo:', error);
        saveStatus.textContent = `Error al cargar: ${error.message}`;
        profileContent.innerHTML = `<p>Error al cargar el perfil.</p>`;
        servicesSection.innerHTML = `<p>Error al cargar servicios.</p>`;
        availabilitySection.innerHTML = `<p>Error al cargar disponibilidad.</p>`;
        bookingLinkContainer.innerHTML = `<p>Error al cargar el enlace.</p>`; // << NUEVO
    }
}

// --- RENDERIZADO ---
function renderBarberForm(barberData) { /* ... (Sin cambios aquí) ... */
    profileContent.innerHTML = `
        <h2>Datos Básicos</h2>
        <form id="barber-profile-form">
            <label for="barber-name">Nombre Completo:</label>
            <input type="text" id="barber-name" value="${barberData?.nombre || ''}" required>
            <label for="barber-phone">Teléfono (con cód. país, ej: 58412...):</label>
            <input type="tel" id="barber-phone" value="${barberData?.telefono || ''}" required>
            <label for="barber-photo">Foto:</label>
            <input type="file" id="barber-photo" accept="image/*">
            <img src="${barberData?.foto_perfil_url || ''}" alt="Foto" id="current-profile-img" class="profile-img-preview" style="${barberData?.foto_perfil_url ? 'display:block;' : 'display:none;'}">
        </form>
    `;
    document.getElementById('barber-photo').addEventListener('change', (event) => {
        const file = event.target.files[0];
        const imgPreview = document.getElementById('current-profile-img');
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => { imgPreview.src = e.target.result; imgPreview.style.display = 'block'; };
            reader.readAsDataURL(file);
        }
    });
}

function renderServices(barberServices) { /* ... (Sin cambios aquí) ... */
    let html = '<h3>Servicios Estándar</h3>';
    if (!masterServices || masterServices.length === 0) {
        html += '<p>No hay servicios estándar definidos. Contacta al administrador.</p>';
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
                    <button class="remove-custom-service" data-id="${bs.id}" style="margin-left: 10px; background-color: #ff6b6b; color: white; border: none; padding: 3px 6px; cursor: pointer; border-radius: 3px;">X</button>
                </div>
            `;
        });
    }

    servicesSection.innerHTML = html;

    servicesSection.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const priceInput = servicesSection.querySelector(`input[data-price-for="${e.target.dataset.id}"]`);
            priceInput.disabled = !e.target.checked;
            if (!e.target.checked) priceInput.value = '';
        });
    });

    servicesSection.querySelectorAll('.remove-custom-service').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const serviceId = e.target.dataset.id;
            if (confirm('¿Seguro que quieres eliminar este servicio personalizado?')) {
                saveStatus.textContent = 'Eliminando...';
                const { error } = await supabaseClient.from('barbero_servicios').delete().eq('id', serviceId);
                if (error) { alert('Error al eliminar: ' + error.message); saveStatus.textContent = 'Error.'; }
                else {
                    saveStatus.textContent = 'Eliminado.';
                    const { data, err } = await supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId);
                    if (err) console.error("Error recargando servicios:", err);
                    else renderServices(data || []);
                    setTimeout(() => saveStatus.textContent = "", 2000);
                }
            }
        });
    });
}

function renderAvailability(availabilityData) { /* ... (Sin cambios aquí) ... */
    let html = '';
    daysOfWeek.forEach((dayName, dayIndex) => {
        html += `<div class="availability-day" data-day="${dayIndex}"><h4>${dayName}</h4>`;
        const daySlots = availabilityData.filter(slot => slot.dia_semana === dayIndex);
        if (daySlots.length === 0) {
            html += '<p>No hay horarios definidos.</p>';
        } else {
            daySlots.forEach(slot => {
                html += renderSlotInput(slot.id, slot.hora_inicio, slot.hora_fin);
            });
        }
        html += `<button class="add-slot-btn" data-day="${dayIndex}">+ Añadir Bloque</button></div><hr>`;
    });
    availabilitySection.innerHTML = html;
}

function renderSlotInput(id, start, end) { /* ... (Sin cambios aquí) ... */
     return `
        <div class="time-slot" data-slot-id="${id || 'new'}">
            <input type="time" value="${start ? start.substring(0, 5) : '08:00'}">
            <span> - </span>
            <input type="time" value="${end ? end.substring(0, 5) : '12:00'}">
            <button class="remove-slot-btn" data-id="${id || 'new'}">X</button>
        </div>
    `;
}

// --- == NUEVA FUNCIÓN PARA RENDERIZAR EL ENLACE == ---
function renderBookingLink(userId) {
    if (bookingLinkContainer && userId) {
        // Construye la URL completa. Esto asume que reserva.html está en el mismo directorio
        // que barber_profile.html. Si está en otro lugar, ajusta la ruta.
        const baseUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        const bookingUrl = `${baseUrl}/reserva.html?barber_id=${userId}`;

        bookingLinkContainer.innerHTML = `
            <p>Este es tu enlace personal:</p>
            <a href="${bookingUrl}" target="_blank">${bookingUrl}</a>
            <br><br>
            <button id="copy-link-btn">Copiar Enlace</button>
        `;

        // Añadir funcionalidad al botón de copiar (opcional pero útil)
        document.getElementById('copy-link-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(bookingUrl).then(() => {
                alert('¡Enlace copiado al portapapeles!');
            }).catch(err => {
                alert('Error al copiar el enlace. Cópialo manualmente.');
                console.error('Error al copiar:', err);
            });
        });

    } else if (bookingLinkContainer) {
        bookingLinkContainer.innerHTML = `<p>No se pudo generar el enlace (Falta ID de usuario).</p>`;
    }
}
// --- == FIN NUEVA FUNCIÓN == ---


// --- MANEJO DE EVENTOS ---
function setupEventListeners() { /* ... (Sin cambios aquí) ... */
    logoutProfileButton.addEventListener('click', logout);
    saveAllButton.addEventListener('click', saveAllChanges);
    addOtherServiceButton.addEventListener('click', addOtherService);

    availabilitySection.addEventListener('click', (e) => {
        if (e.target.classList.contains('add-slot-btn')) {
            const dayIndex = e.target.dataset.day;
            const dayDiv = availabilitySection.querySelector(`.availability-day[data-day="${dayIndex}"]`);
            const button = dayDiv.querySelector('.add-slot-btn');
            const newSlotHtml = renderSlotInput(null, null, null);
            button.insertAdjacentHTML('beforebegin', newSlotHtml);
        }
        if (e.target.classList.contains('remove-slot-btn')) {
            const slotDiv = e.target.closest('.time-slot');
            const slotId = e.target.dataset.id;
            if (slotId && slotId !== 'new') {
                if (confirm('¿Eliminar este bloque horario? (Se guardará al hacer clic en "Guardar Todos los Cambios")')) {
                    supabaseClient.from('disponibilidad').delete().eq('id', slotId)
                        .then(({ error }) => {
                            if (error) alert('Error al eliminar: ' + error.message);
                            else slotDiv.remove();
                        });
                }
            } else {
                slotDiv.remove();
            }
        }
    });
}

// --- ACCIONES ---
async function addOtherService() { /* ... (Sin cambios aquí) ... */
    const nameInput = document.getElementById('other-service-name');
    const priceInput = document.getElementById('other-service-price');
    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);

    if (!name || isNaN(price) || price <= 0) {
        alert('Por favor, introduce un nombre y un precio válido.');
        return;
    }

    saveStatus.textContent = 'Añadiendo...';
    const { error } = await supabaseClient.from('barbero_servicios').insert({
        barbero_id: currentUserId,
        servicio_id: null,
        precio: price,
        nombre_personalizado: name
    });

    if (error) {
        alert('Error al añadir servicio: ' + error.message);
        saveStatus.textContent = 'Error.';
    } else {
        saveStatus.textContent = 'Servicio añadido.';
        nameInput.value = '';
        priceInput.value = '';
        const { data, err } = await supabaseClient.from('barbero_servicios').select('*, servicios_maestro(*)').eq('barbero_id', currentUserId);
        if(err) console.error("Error recargando:", err);
        else renderServices(data || []);
        setTimeout(() => saveStatus.textContent = "", 2000);
    }
}
async function saveAllChanges() { /* ... (Sin cambios aquí) ... */
    saveStatus.textContent = "Guardando...";
    saveAllButton.disabled = true;

    try {
        await saveBasicProfile();
        await saveServices();
        await saveAvailability();
        saveStatus.textContent = "¡Todos los cambios guardados con éxito! ✅";
        setTimeout(() => saveStatus.textContent = "", 3000);
    } catch (error) {
        console.error("Error al guardar todo:", error);
        saveStatus.textContent = `Error: ${error.message}`;
    } finally {
        saveAllButton.disabled = false;
    }
}
async function saveBasicProfile() { /* ... (Sin cambios aquí) ... */
    const nombre = document.getElementById('barber-name').value;
    const telefono = document.getElementById('barber-phone').value;
    const fotoFile = document.getElementById('barber-photo').files[0];
    let foto_perfil_url = document.getElementById('current-profile-img').src;

    if (fotoFile) {
        const fileExt = fotoFile.name.split('.').pop();
        const filePath = `${currentUserId}/${Date.now()}.${fileExt}`;
        const { data, error: uploadError } = await supabaseClient.storage
            .from('barber-photos')
            .upload(filePath, fotoFile, { cacheControl: '3600', upsert: true });
        if (uploadError) throw new Error(`Subida Foto: ${uploadError.message}`);
        const { data: urlData } = supabaseClient.storage.from('barber-photos').getPublicUrl(filePath);
        foto_perfil_url = urlData.publicUrl;
    }

    const { error } = await supabaseClient
        .from('barberos')
        .update({ nombre, telefono, foto_perfil_url })
        .eq('user_id', currentUserId);
    if (error) throw new Error(`Perfil Básico: ${error.message}`);
    console.log("Perfil básico guardado.");
}
async function saveServices() { /* ... (Sin cambios aquí) ... */
     const servicesToUpsert = [];
    const serviceIdsToKeep = []; // Para saber cuáles borrar
    const serviceCheckboxes = servicesSection.querySelectorAll('input[type="checkbox"]');

    serviceCheckboxes.forEach(cb => {
        const serviceId = cb.dataset.id;
        const priceInput = servicesSection.querySelector(`input[data-price-for="${serviceId}"]`);
        if (cb.checked) {
            const price = parseFloat(priceInput.value);
            if (!isNaN(price) && price >= 0) {
                servicesToUpsert.push({
                    barbero_id: currentUserId,
                    servicio_id: serviceId,
                    precio: price
                });
                serviceIdsToKeep.push(serviceId); // Guardamos el ID maestro
            } else {
                throw new Error(`Precio inválido para ${cb.nextElementSibling.textContent}`);
            }
        }
    });

    const { error: deleteError } = await supabaseClient
        .from('barbero_servicios')
        .delete()
        .eq('barbero_id', currentUserId)
        .not('servicio_id', 'is', null)
        .not('servicio_id', 'in', `(${serviceIdsToKeep.map(id => `'${id}'`).join(',') || "''"})`);

    if (deleteError) console.warn("Aviso borrando servicios:", deleteError.message);

    if (servicesToUpsert.length > 0) {
        const { error } = await supabaseClient
            .from('barbero_servicios')
            .upsert(servicesToUpsert, { onConflict: 'barbero_id, servicio_id', ignoreDuplicates: false });
        if (error) throw new Error(`Guardando Servicios: ${error.message}`);
    }
    console.log("Servicios estándar guardados.");
}
async function saveAvailability() { /* ... (Sin cambios aquí) ... */
     const slotsToInsert = [];
    const availabilityDays = availabilitySection.querySelectorAll('.availability-day');

    availabilityDays.forEach(dayDiv => {
        const dayIndex = parseInt(dayDiv.dataset.day);
        const slots = dayDiv.querySelectorAll('.time-slot');
        slots.forEach(slotDiv => {
            const inputs = slotDiv.querySelectorAll('input[type="time"]');
            const start = inputs[0].value;
            const end = inputs[1].value;

            if (start && end && start < end) {
                slotsToInsert.push({
                    barbero_id: currentUserId,
                    dia_semana: dayIndex,
                    hora_inicio: start,
                    hora_fin: end
                });
            } else {
                console.warn(`Bloque horario inválido o incompleto para día ${dayIndex}. Ignorando.`);
            }
        });
    });

    const { error: deleteError } = await supabaseClient
        .from('disponibilidad')
        .delete()
        .eq('barbero_id', currentUserId);
    if (deleteError) throw new Error(`Disponibilidad (Borrado): ${deleteError.message}`);

    if (slotsToInsert.length > 0) {
        const { error: insertError } = await supabaseClient
            .from('disponibilidad')
            .insert(slotsToInsert);
        if (insertError) throw new Error(`Disponibilidad (Inserción): ${insertError.message}`);
    }
    console.log("Disponibilidad guardada.");
}
async function logout() { /* ... (Sin cambios aquí) ... */
    saveStatus.textContent = 'Cerrando sesión...';
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) console.error('Error al cerrar sesión:', error);
}

// --- INICIAR ---
document.addEventListener('DOMContentLoaded', initSupabaseInProfile);
