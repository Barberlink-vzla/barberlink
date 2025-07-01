// js/reserva.js

document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabaseClient === 'undefined') {
        console.error("Reserva Error: supabaseClient no está definido.");
        return;
    }
    console.log("Módulo de reserva iniciado correctamente. ✅");

  // --- State Management ---
let currentStep = 1;
let barberId = null;
let barberData = null;
let barberClients = []; 
let selectedClient = null; 
let selectedService = null;
let selectedServiceDuration = null; // <-- NUEVA VARIABLE DE ESTADO
let availableSlots = [];

    // --- DOM Elements ---
    const form = document.getElementById('barberBookingForm');
    const steps = document.querySelectorAll('.form-step');
    const progressBarSteps = document.querySelectorAll('.progress-bar-step');
    const serviceSelect = document.getElementById('service-select');
    const dateInput = document.getElementById('booking-date');
    const timeSelect = document.getElementById('time-select');
    const barberNameTitle = document.getElementById('barber-name-title');
    const barberProfileImg = document.getElementById('barber-profile-img');
    const bookingSummary = document.getElementById('booking-summary');
    const statusMessage = document.getElementById('booking-status');
    const successMessageContainer = document.getElementById('booking-success-message');
    const whatsappLinkContainer = document.getElementById('whatsapp-link-container');
    const clientSearchInput = document.getElementById('cliente-search');
    const clientResultsList = document.getElementById('cliente-results-list');
    const clientPhoneInput = document.getElementById('cliente_telefono');


    // --- Functions ---

    const getBarberIdFromURL = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get('barber_id');
    };

    const fetchBarberData = async () => {
        if (!barberId) {
            statusMessage.textContent = "Error: No se ha especificado un barbero.";
            statusMessage.className = 'status-message error';
            return;
        }

        const { data, error } = await supabaseClient
            .from('barberos')
            .select(`
                nombre,
                telefono,
                foto_perfil_url,
                barbero_servicios (
                    id,
                    precio,
                    nombre_personalizado,
                    servicios_maestro (id, nombre)
                )
            `)
            .eq('user_id', barberId)
            .single();

        if (error || !data) {
            console.error("Error fetching barber data:", error);
            statusMessage.textContent = "No se pudo cargar la información del barbero.";
            statusMessage.className = 'status-message error';
            return;
        }

        barberData = data;
        updateBarberInfoUI();
        populateServiceSelect();
        await fetchBarberClients(); 
    };
    
    const fetchBarberClients = async () => {
        if (!barberId) return;
        const { data, error } = await supabaseClient
            .from('clientes')
            .select('id, nombre, apellido, telefono')
            .eq('barbero_id', barberId);

        if (error) {
            console.error('Error fetching clients:', error);
            return;
        }
        barberClients = data;
    };


    const updateBarberInfoUI = () => {
        if (!barberData) return;
        barberNameTitle.textContent = `Reservar con ${barberData.nombre}`;
        if (barberData.foto_perfil_url) {
            barberProfileImg.src = barberData.foto_perfil_url;
        }
    };

    const populateServiceSelect = () => {
        if (!barberData || !barberData.barbero_servicios) return;

        serviceSelect.innerHTML = '<option value="" disabled selected>Selecciona un servicio</option>';

        barberData.barbero_servicios.forEach(service => {
            const option = document.createElement('option');
            option.value = service.id;
            const serviceName = service.nombre_personalizado || service.servicios_maestro.nombre;
            option.textContent = `${serviceName} - $${service.precio}`;
            option.dataset.serviceData = JSON.stringify(service);
            serviceSelect.appendChild(option);
        });
    };

    const fetchAvailability = async (date) => {
    // Si no hay duración (no se ha seleccionado servicio), no buscar.
    if (!barberId || !date || !selectedServiceDuration) {
        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option>Selecciona un servicio primero</option>';
        return;
    }
    
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option>Cargando horarios...</option>';

    const { data, error } = await supabaseClient.rpc('get_available_slots_by_duration', {
        p_barber_id: barberId,
        p_booking_date: date,
        // La función RPC espera un tipo INTERVAL, que se puede pasar como string
        p_service_duration: `${selectedServiceDuration} minutes` 
    });

    if (error) {
        console.error('Error fetching availability:', error);
        timeSelect.innerHTML = '<option>Error al cargar horarios</option>';
        // Dar un mensaje más útil al usuario
        alert(`Ocurrió un error al buscar horarios: ${error.message}. Intenta de nuevo.`);
        return;
    }

    // La data ahora viene como un array de objetos {start_time: "HH:mm:ss"}
    // así que necesitamos adaptarlo un poco.
    availableSlots = data.map(slot => ({ start_time: slot.start_time }));
    populateTimeSelect();
};

    const populateTimeSelect = () => {
        if (availableSlots.length === 0) {
            timeSelect.innerHTML = '<option value="">No hay horarios disponibles</option>';
            return;
        }

        timeSelect.innerHTML = '<option value="" disabled selected>Selecciona una hora</option>';
        availableSlots.forEach(slot => {
            const option = document.createElement('option');
            const timeParts = slot.start_time.split(':');
            const date = new Date();
            date.setHours(timeParts[0], timeParts[1], 0);
            const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            
            option.value = slot.start_time;
            option.textContent = formattedTime;
            timeSelect.appendChild(option);
        });
        timeSelect.disabled = false;
    };
    
    const navigateToStep = (stepNumber) => {
        if (stepNumber < 1 || stepNumber > steps.length) return;

        if (stepNumber > currentStep) {
             if (currentStep === 1 && !serviceSelect.value) { alert("Por favor, selecciona un servicio."); return; }
             if (currentStep === 2 && (!dateInput.value || !timeSelect.value)) { alert("Por favor, selecciona fecha y hora."); return; }
             if (currentStep === 3) {
                if (!clientSearchInput.value.trim() || !clientPhoneInput.value.trim()) { 
                    alert("Por favor, completa tu nombre y teléfono."); return; 
                }
             }
        }
        
        currentStep = stepNumber;

        steps.forEach(step => step.classList.remove('active-step'));
        document.getElementById(`step-${currentStep}`).classList.add('active-step');

        progressBarSteps.forEach((pbStep, index) => {
            const stepNum = index + 1;
            if (stepNum < currentStep) {
                pbStep.classList.add('completed');
                pbStep.classList.remove('active');
            } else if (stepNum === currentStep) {
                pbStep.classList.add('active');
                pbStep.classList.remove('completed');
            } else {
                pbStep.classList.remove('active', 'completed');
            }
        });
        
        if (currentStep === 4) {
            updateBookingSummary();
        }
    };
    
    const updateBookingSummary = () => {
        const serviceData = JSON.parse(serviceSelect.options[serviceSelect.selectedIndex].dataset.serviceData);
        const serviceName = serviceData.nombre_personalizado || serviceData.servicios_maestro.nombre;
        const date = new Date(dateInput.value + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const time = timeSelect.options[timeSelect.selectedIndex].textContent;
        const clientName = clientSearchInput.value;

        bookingSummary.innerHTML = `
            <p><strong>Barbero:</strong> ${barberData.nombre}</p>
            <p><strong>Servicio:</strong> ${serviceName}</p>
            <p><strong>Precio:</strong> $${serviceData.precio}</p>
            <p><strong>Fecha:</strong> ${date}</p>
            <p><strong>Hora:</strong> ${time}</p>
            <p><strong>Cliente:</strong> ${clientName.trim()}</p>
        `;
    };

    const getClientIdForBooking = async () => {
        if (selectedClient) {
            return selectedClient.id;
        }

        const nameParts = clientSearchInput.value.trim().split(' ');
        const nombre = nameParts.shift() || '';
        const apellido = nameParts.join(' ');

        const clientData = {
            barbero_id: barberId,
            nombre: nombre,
            apellido: apellido,
            telefono: clientPhoneInput.value.trim(),
        };

        if (!clientData.nombre || !clientData.telefono) {
            throw new Error("El nombre y el teléfono del cliente son obligatorios.");
        }

        const { data, error } = await supabaseClient
            .from('clientes')
            .upsert(clientData, { onConflict: 'barbero_id, telefono' })
            .select()
            .single();

        if (error) {
            console.error("Error al guardar cliente:", error);
            throw new Error(`No se pudo guardar la información del cliente: ${error.message}`);
        }

        return data.id;
    };

    // Reemplaza la función completa en tu archivo js/reserva.js

const handleBookingSubmit = async (e) => {
    e.preventDefault();
    statusMessage.textContent = 'Procesando reserva...';
    statusMessage.className = 'status-message';

    try {
        const serviceData = JSON.parse(serviceSelect.options[serviceSelect.selectedIndex].dataset.serviceData);
        const startTime = timeSelect.value;

        // ===== INICIO DE LA CORRECCIÓN =====
        // Se corrige la creación del objeto Date para que sea válida.
        const bookingDate = new Date(`${dateInput.value}T${startTime}`);
        // ===== FIN DE LA CORRECCIÓN =====
        
        // Se calcula la duración dinámicamente o se usa 30 min por defecto.
const durationInMinutes = selectedService.duracion_minutos || 30; // Usar la variable global
const endTime = new Date(bookingDate.getTime() + durationInMinutes * 60 * 1000).toTimeString().slice(0, 8);

        await getClientIdForBooking();

        const bookingData = {
            barbero_id: barberId,
            cliente_nombre: clientSearchInput.value.trim(),
            cliente_telefono: clientPhoneInput.value.trim(),
            servicio_reservado_id: serviceData.id,
            fecha_cita: dateInput.value,
            hora_inicio_cita: startTime,
            hora_fin_cita: endTime,
            precio_final: serviceData.precio,
            estado: 'pendiente' // El estado inicial siempre es pendiente
        };

        const { data: bookingResult, error: bookingError } = await supabaseClient
            .from('citas')
            .insert(bookingData)
            .select()
            .single();

        if (bookingError) {
            // Se detecta específicamente el error de cita duplicada.
            if (bookingError.code === '23505') { // Código de error de PostgreSQL para violación de unicidad
                throw new Error("Lo sentimos, este horario acaba de ser reservado. Por favor, selecciona otro.");
            }
            throw new Error(`No se pudo crear la cita: ${bookingError.message}`);
        }

        // Se asegura que bookingResult no sea nulo antes de continuar
        if (!bookingResult) {
            throw new Error("La reserva no pudo ser confirmada. Inténtalo de nuevo.");
        }

        const channel = supabaseClient.channel(`notifications-channel-for-${barberId}`);
        await channel.send({
            type: 'broadcast',
            event: 'new_booking',
            payload: { cita_id: bookingResult.id }
        });

        form.style.display = 'none';
        successMessageContainer.style.display = 'block';
        statusMessage.textContent = '';
        generateWhatsAppLink(bookingResult);

    } catch (error) {
        console.error("Error en el proceso de reserva:", error);
        // El mensaje de error ahora es mucho más claro para el usuario.
        statusMessage.textContent = `Error: ${error.message}`;
        statusMessage.className = 'status-message error';

        // Sugerencia para recargar horarios disponibles
        alert(error.message + "\n\nVamos a recargar los horarios disponibles.");
        fetchAvailability(dateInput.value); // Recarga los horarios para la fecha seleccionada
    }
};
    
    const generateWhatsAppLink = (booking) => {
        const barberPhone = barberData.telefono.replace(/\D/g, '');
        const serviceName = selectedService.nombre_personalizado || selectedService.servicios_maestro.nombre;
        const date = new Date(booking.fecha_cita + 'T12:00:00').toLocaleDateString('es-ES', {dateStyle: 'long'});
        const time = new Date(`1970-01-01T${booking.hora_inicio_cita}`).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});
        
        const message = `¡Hola! Acabo de reservar una cita:\n\n*Servicio:* ${serviceName}\n*Cliente:* ${booking.cliente_nombre}\n*Fecha:* ${date}\n*Hora:* ${time}\n\nPor favor, confírmame la cita. ¡Gracias!`;
        
        const whatsappUrl = `https://wa.me/${barberPhone}?text=${encodeURIComponent(message)}`;
        
        whatsappLinkContainer.innerHTML = `<a href="${whatsappUrl}" target="_blank" class="style-button whatsapp-confirm-button"><i class="fab fa-whatsapp"></i> Enviar Confirmación por WhatsApp</a>`;
    };

    // --- FUNCIONES PARA AUTOCOMPLETADO ---
    
    const showClientResults = (searchTerm) => {
        clientResultsList.innerHTML = '';
        if (!searchTerm) {
            clientResultsList.style.display = 'none';
            return;
        }

        const filteredClients = barberClients.filter(client =>
            `${client.nombre} ${client.apellido || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (filteredClients.length > 0) {
            filteredClients.forEach(client => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.textContent = `${client.nombre} ${client.apellido || ''}`;
                item.addEventListener('click', () => handleClientSelection(client));
                clientResultsList.appendChild(item);
            });
        } else {
            const item = document.createElement('div');
            item.className = 'autocomplete-item no-results';
            item.textContent = 'No se encontró el cliente. Continúa para registrarlo.';
            clientResultsList.appendChild(item);
        }
        clientResultsList.style.display = 'block';
    };

    const handleClientSelection = (client) => {
        selectedClient = client;
        clientSearchInput.value = `${client.nombre} ${client.apellido || ''}`.trim();
        clientPhoneInput.value = client.telefono || '';
        clientResultsList.innerHTML = '';
        clientResultsList.style.display = 'none';
        clientPhoneInput.focus();
    };
    
    const setupAutocompleteListeners = () => {
        clientSearchInput.addEventListener('input', () => {
            selectedClient = null;
            showClientResults(clientSearchInput.value);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.autocomplete-container')) {
                clientResultsList.style.display = 'none';
            }
        });
    };


    // --- Event Listeners ---
    form.addEventListener('submit', handleBookingSubmit);
    
    document.getElementById('next-step-1').addEventListener('click', () => navigateToStep(2));
    document.getElementById('prev-step-2').addEventListener('click', () => navigateToStep(1));
    document.getElementById('next-step-2').addEventListener('click', () => navigateToStep(3));
    document.getElementById('prev-step-3').addEventListener('click', () => navigateToStep(2));
    document.getElementById('next-step-3').addEventListener('click', () => navigateToStep(4));
    document.getElementById('prev-step-4').addEventListener('click', () => navigateToStep(3));

    dateInput.addEventListener('change', () => {
        // Obtenemos la fecha de "hoy" de una manera segura para la zona horaria
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;

        if (dateInput.value < todayString) {
            alert("No puedes seleccionar una fecha pasada.");
            dateInput.value = '';
            timeSelect.innerHTML = '<option value="">Selecciona una fecha válida</option>';
            timeSelect.disabled = true;
            return;
        }
        fetchAvailability(dateInput.value);
    });
    
   serviceSelect.addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    selectedService = JSON.parse(selectedOption.dataset.serviceData);
    
    // Guardamos la duración del servicio seleccionado. Usamos 30 como fallback.
    selectedServiceDuration = selectedService.duracion_minutos || 30; // <-- LÓGICA AÑADIDA

    // Si ya se había seleccionado una fecha, volvemos a cargar la disponibilidad
    // porque ahora depende de la duración del servicio.
    if (dateInput.value) {
        fetchAvailability(dateInput.value);
    }
});

    // --- Initial Load ---
    barberId = getBarberIdFromURL();
    fetchBarberData();
    setupAutocompleteListeners();
});
