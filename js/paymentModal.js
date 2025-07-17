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

// --- INICIO DE LA MEJORA: Nuevos elementos para la selección de moneda ---
const cashOptionsContainer = document.getElementById('cash-payment-options');
const savePaymentBtn = document.getElementById('save-payment-btn'); // Botón genérico para pagos no-efectivo
const payCashUsdBtn = document.getElementById('pay-cash-usd-btn');
const payCashVesBtn = document.getElementById('pay-cash-ves-btn');
// --- FIN DE LA MEJORA ---


/**
 * Muestra el modal de pago con los datos de la cita.
 */
function showPaymentModal(cita) {
    if (!paymentOverlay || !cita) {
        console.error("No se pudo mostrar el modal de pago. Faltan elementos o datos.");
        return;
    }

    currentCitaForPayment = cita;
    paymentClientName.textContent = cita.cliente_nombre;

    // Muestra el monto y la moneda guardados en la cita. Esto funciona como precio de referencia.
    const monto = cita.monto ?? 0;
    const moneda = cita.moneda ?? 'USD';
    paymentAmount.innerHTML = `Referencia: <strong>${moneda} ${monto.toFixed(2)}</strong>`;
    
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
    
    // Ocultar todos los botones de acción al inicio
    savePaymentBtn.style.display = 'none';
    cashOptionsContainer.style.display = 'none';
    
    // Habilitar todos los botones
    savePaymentBtn.disabled = false;
    payCashUsdBtn.disabled = false;
    payCashVesBtn.disabled = false;

    savePaymentBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Pago y Finalizar';
    deadlineContainer.style.display = 'none';
    
    // Seleccionar 'transferencia' por defecto al abrir
    const defaultRadio = document.getElementById('pay-efectivo');
    if(defaultRadio) {
        defaultRadio.checked = true;
        handlePaymentMethodChange(); // Llamar para mostrar la UI correcta
    }
}


/**
 * Maneja el cambio en el método de pago seleccionado.
 * ESTA FUNCIÓN AHORA CONTROLA QUÉ BOTONES DE ACCIÓN SE MUESTRAN.
 */
function handlePaymentMethodChange() {
    const selectedMethod = paymentForm.querySelector('input[name="metodo_pago"]:checked')?.value;
    
    // Ocultar todo por defecto
    deadlineContainer.style.display = 'none';
    cashOptionsContainer.style.display = 'none';
    savePaymentBtn.style.display = 'none';
    paymentStatusMessage.textContent = '';

    if (selectedMethod === 'efectivo') {
        // Si es efectivo, mostrar las opciones de moneda (USD/VES)
        cashOptionsContainer.style.display = 'block';
    } else if (selectedMethod === 'no_pagado') {
        // Si es deuda, mostrar el campo de fecha límite y el botón de guardar genérico
        deadlineContainer.style.display = 'block';
        savePaymentBtn.style.display = 'block';
        savePaymentBtn.innerHTML = '<i class="fas fa-user-clock"></i> Registrar Deuda y Finalizar';
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        deadlineInput.value = tomorrow.toISOString().split('T')[0];
    } else {
        // Para otros métodos (Transferencia, Pago Móvil), mostrar el botón de guardar genérico.
        // Estos se asumirán como pagos en VES.
        savePaymentBtn.style.display = 'block';
        savePaymentBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Pago y Finalizar';
        paymentStatusMessage.textContent = `Se registrará el monto equivalente en ${currencyManager.secondaryCurrency}.`;
        paymentStatusMessage.className = 'status-message info';
    }
}

/**
 * Función centralizada para guardar el pago. Es llamada por los diferentes botones de acción.
 * @param {Event} e - El evento del formulario o del click.
 * @param {string|null} receivedCurrency - La moneda en la que se recibió el pago ('USD', 'VES', o null para deudas).
 */
async function handleSavePayment(e, receivedCurrency = null) {
    e.preventDefault();
    if (!currentCitaForPayment) return;

    const paymentMethod = paymentForm.querySelector('input[name="metodo_pago"]:checked')?.value;
    if(!paymentMethod) {
        alert("Por favor, selecciona un método de pago.");
        return;
    }

    // Deshabilitar todos los botones de acción para evitar doble click
    savePaymentBtn.disabled = true;
    payCashUsdBtn.disabled = true;
    payCashVesBtn.disabled = true;
    
    paymentStatusMessage.textContent = 'Procesando...';
    paymentStatusMessage.className = 'status-message processing';

    const esDeuda = (paymentMethod === 'no_pagado');
    const fechaLimite = esDeuda ? deadlineInput.value : null;
    
    // --- INICIO DE LA NUEVA LÓGICA DE REGISTRO DE PAGO ---
    let monto_usd = 0;
    let monto_ves = 0;

    // El monto y la moneda de referencia de la cita
    const montoCita = currentCitaForPayment.monto || 0;
    const monedaCita = currentCitaForPayment.moneda || 'USD';

    if (!esDeuda) {
        // Determinar en qué moneda se está pagando. Para pagos no-efectivo, se asume VES.
        const finalReceivedCurrency = receivedCurrency || currencyManager.secondaryCurrency;

        if (finalReceivedCurrency === 'USD') {
            // Se pagó en USD.
            // Si la cita era en VES, se convierte a USD. Si era en USD, se usa el monto original.
            monto_usd = (monedaCita === 'USD') ? montoCita : (montoCita / currencyManager.finalRate);
        } else { // 'VES'
            // Se pagó en VES.
            // Si la cita era en USD, se convierte a VES. Si era en VES, se usa el monto original.
            monto_ves = (monedaCita === 'VES') ? montoCita : (montoCita * currencyManager.finalRate);
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
        // Volver a habilitar los botones en caso de error
        savePaymentBtn.disabled = false;
        payCashUsdBtn.disabled = false;
        payCashVesBtn.disabled = false;
    }
}

/**
 * Configura todos los listeners de eventos para el modal de pago.
 */
function setupPaymentModalListeners() {
    if (!paymentForm) return;

    // El formulario ahora solo maneja los casos que no son de efectivo (deudas, transferencias, etc.)
    paymentForm.addEventListener('submit', handleSavePayment);

    if (paymentCloseBtn) paymentCloseBtn.addEventListener('click', closePaymentModal);
    if (paymentOverlay) paymentOverlay.addEventListener('click', (e) => {
        if (e.target === paymentOverlay) closePaymentModal();
    });

    // Listener para los radio buttons que cambian la UI
    paymentForm.querySelectorAll('input[name="metodo_pago"]').forEach(radio => {
        radio.addEventListener('change', handlePaymentMethodChange);
    });

    // --- INICIO DE LA MEJORA: Listeners para los botones de pago en efectivo ---
    if(payCashUsdBtn) {
        payCashUsdBtn.addEventListener('click', (e) => handleSavePayment(e, 'USD'));
    }
    if(payCashVesBtn) {
        payCashVesBtn.addEventListener('click', (e) => handleSavePayment(e, 'VES'));
    }
    // --- FIN DE LA MEJORA ---
}

// Inicializar los listeners al cargar
document.addEventListener('DOMContentLoaded', setupPaymentModalListeners);
