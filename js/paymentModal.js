// js/paymentModal.js

// Estado y elementos del DOM
let currentCitaForPayment = null;
const paymentOverlay = document.getElementById('payment-modal-overlay');
const paymentModal = document.getElementById('payment-modal');
const paymentForm = document.getElementById('payment-form');
const paymentCloseBtn = document.getElementById('payment-modal-close-btn');
const paymentClientName = document.getElementById('payment-client-name');
const paymentAmount = document.getElementById('payment-amount');
const paymentCitaIdInput = document.getElementById('payment-cita-id');
const deadlineContainer = document.getElementById('payment-deadline-container');
const deadlineInput = document.getElementById('payment-deadline-date');
const paymentStatusMessage = document.getElementById('payment-status-message');
const cashOptionsContainer = document.getElementById('cash-payment-options');
const savePaymentBtn = document.getElementById('save-payment-btn');

/**
 * Muestra el modal de pago con los datos de la cita.
 * @param {object} cita - El objeto de la cita a pagar.
 */
function showPaymentModal(cita) {
    if (!paymentOverlay || !cita) {
        console.error("No se pudo mostrar el modal de pago. Faltan elementos o datos.");
        return;
    }

    currentCitaForPayment = cita;
    paymentClientName.textContent = cita.cliente_nombre;

    // --- CAMBIO CLAVE: Mostrar el monto y la moneda guardados en la cita ---
    const monto = cita.monto ?? 0;
    const moneda = cita.moneda ?? 'USD'; // Default a USD si no está definido
    paymentAmount.innerHTML = `<strong>${moneda} ${monto.toFixed(2)}</strong>`;
    // --- FIN DEL CAMBIO ---
    
    paymentCitaIdInput.value = cita.id;
    paymentForm.reset();
    resetPaymentModalUI();

    paymentOverlay.classList.add('active');
}

/**
 * Cierra el modal de pago.
 */
function closePaymentModal() {
    if (paymentOverlay) {
        paymentOverlay.classList.remove('active');
    }
    currentCitaForPayment = null;
}

/**
 * Resetea la UI del modal a su estado inicial.
 */
function resetPaymentModalUI() {
    paymentStatusMessage.textContent = '';
    paymentStatusMessage.className = 'status-message';
    savePaymentBtn.style.display = 'block'; // Mostrar botón principal
    savePaymentBtn.disabled = false;
    savePaymentBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Pago y Finalizar';
    deadlineContainer.style.display = 'none'; // Ocultar campo de fecha límite
    cashOptionsContainer.style.display = 'none'; // Ocultar opciones de efectivo
    
    // Seleccionar 'transferencia' por defecto al abrir
    const defaultRadio = document.getElementById('pay-transferencia');
    if(defaultRadio) defaultRadio.checked = true;
}


/**
 * Maneja el cambio en el método de pago seleccionado.
 */
function handlePaymentMethodChange() {
    const selectedMethod = paymentForm.querySelector('input[name="metodo_pago"]:checked')?.value;
    
    deadlineContainer.style.display = 'none';
    paymentStatusMessage.textContent = '';
    savePaymentBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Pago y Finalizar';

    if (selectedMethod === 'no_pagado') {
        deadlineContainer.style.display = 'block';
        savePaymentBtn.innerHTML = '<i class="fas fa-user-clock"></i> Registrar Deuda y Finalizar';
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        deadlineInput.value = tomorrow.toISOString().split('T')[0];
    } else {
        const monedaCita = currentCitaForPayment?.moneda || 'USD';
        // Muestra una nota informativa si el pago es en VES
        if(monedaCita === 'VES'){
             paymentStatusMessage.textContent = `Se registrará el monto en ${currencyManager.secondaryCurrency}.`;
             paymentStatusMessage.className = 'status-message info';
        }
    }
}

/**
 * Maneja el guardado de la información de pago.
 * @param {Event} e - El evento de envío del formulario.
 */
async function handleSavePayment(e) {
    e.preventDefault();
    if (!currentCitaForPayment) return;

    const paymentMethod = paymentForm.querySelector('input[name="metodo_pago"]:checked')?.value;
    if(!paymentMethod) {
        alert("Por favor, selecciona un método de pago.");
        return;
    }

    savePaymentBtn.disabled = true;
    savePaymentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    paymentStatusMessage.textContent = 'Procesando...';
    paymentStatusMessage.className = 'status-message processing';

    const esDeuda = (paymentMethod === 'no_pagado');
    const fechaLimite = esDeuda ? deadlineInput.value : null;
    
    // --- INICIO DE LA NUEVA LÓGICA DE REGISTRO DE PAGO ---
    let monto_usd = 0;
    let monto_ves = 0;
    const montoCita = currentCitaForPayment.monto || 0;
    const monedaCita = currentCitaForPayment.moneda || 'USD';

    // Solo se registra el monto si no es una deuda
    if (!esDeuda) {
        if (monedaCita === 'USD') {
            monto_usd = montoCita;
        } else { // Si la moneda de la cita era VES
            monto_ves = montoCita;
        }
    }
    
    const updateData = {
        estado: 'completada',
        metodo_pago: paymentMethod,
        estado_pago: esDeuda ? 'pendiente' : 'pagado',
        fecha_limite_pago: fechaLimite,
        monto_recibido_usd: monto_usd, // Columna para ingresos en USD
        monto_recibido_ves: monto_ves  // Columna para ingresos en VES
    };
    // --- FIN DE LA NUEVA LÓGICA DE REGISTRO DE PAGO ---

    try {
        const { error } = await supabaseClient
            .from('citas')
            .update(updateData)
            .eq('id', currentCitaForPayment.id);

        if (error) throw error;

        document.dispatchEvent(new CustomEvent('paymentProcessed', {
            detail: { citaId: currentCitaForPayment.id }
        }));
        
        paymentStatusMessage.textContent = '¡Operación registrada con éxito! La cita ha sido finalizada.';
        paymentStatusMessage.className = 'status-message success';
        
        setTimeout(closePaymentModal, 2000);

    } catch (error) {
        console.error('Error al guardar el pago:', error);
        paymentStatusMessage.textContent = `Error: ${error.message}`;
        paymentStatusMessage.className = 'status-message error';
        savePaymentBtn.disabled = false;
        handlePaymentMethodChange(); // Restaura el texto original del botón
    }
}

/**
 * Configura todos los listeners de eventos para el modal de pago.
 */
function setupPaymentModalListeners() {
    if (!paymentForm) return;

    paymentForm.addEventListener('submit', handleSavePayment);

    if (paymentCloseBtn) paymentCloseBtn.addEventListener('click', closePaymentModal);
    if (paymentOverlay) paymentOverlay.addEventListener('click', (e) => {
        if (e.target === paymentOverlay) closePaymentModal();
    });

    paymentForm.querySelectorAll('input[name="metodo_pago"]').forEach(radio => {
        radio.addEventListener('change', handlePaymentMethodChange);
    });
}

// Inicializar los listeners al cargar
document.addEventListener('DOMContentLoaded', setupPaymentModalListeners);
