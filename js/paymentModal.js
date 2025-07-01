// js/paymentModal.js

// Estado y elementos del DOM para el modal de pago
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
const savePaymentBtn = document.getElementById('save-payment-btn');

/**
 * Muestra el modal de pago y lo puebla con los datos de la cita.
 * @param {object} cita - El objeto de la cita a pagar.
 */
// REEMPLAZA ESTA FUNCIÓN EN js/paymentModal.js

function showPaymentModal(cita) {
    if (!paymentOverlay || !cita) {
        console.error("No se pudo mostrar el modal de pago. Faltan elementos o datos de la cita.");
        alert("Error al abrir el modal de pago.");
        return;
    }

    currentCitaForPayment = cita;
    paymentClientName.textContent = cita.cliente_nombre;

    // ================== INICIO DE LA CORRECCIÓN ==================
    // Se añade una comprobación robusta para evitar errores si precio_final es null o undefined.
    const precio = cita.precio_final ?? 0;
    if (cita.precio_final == null) {
        console.warn(`La cita ID ${cita.id} no tenía un precio_final definido. Se usó 0 como fallback.`);
    }
    paymentAmount.textContent = `$${precio.toFixed(2)}`;
    // =================== FIN DE LA CORRECCIÓN ====================
    
    paymentCitaIdInput.value = cita.id;

    // Resetear el formulario a su estado inicial
    paymentForm.reset();
    document.getElementById('pay-efectivo').checked = true;
    deadlineContainer.style.display = 'none';

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
 * Maneja el guardado de la información de pago.
 * @param {Event} e - El evento de envío del formulario.
 */
async function handleSavePayment(e) {
    e.preventDefault();
    if (!currentCitaForPayment) return;

    savePaymentBtn.disabled = true;
    savePaymentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    const formData = new FormData(paymentForm);
    const metodoPago = formData.get('metodo_pago');
    const esDeuda = (metodoPago === 'no_pagado');
    const fechaLimite = esDeuda ? deadlineInput.value : null;

    if (esDeuda && !fechaLimite) {
        alert("Por favor, establece una fecha límite para el pago de la deuda.");
        savePaymentBtn.disabled = false;
        savePaymentBtn.innerHTML = '<i class="fas fa-save"></i> Guardar y Finalizar Cita';
        return;
    }

    const updateData = {
        estado: 'completada', // La cita ahora se marca como completada
        metodo_pago: metodoPago,
        estado_pago: esDeuda ? 'pendiente' : 'pagado',
        fecha_limite_pago: fechaLimite
    };

    try {
        const { error } = await supabaseClient
            .from('citas')
            .update(updateData)
            .eq('id', currentCitaForPayment.id);

        if (error) {
            throw new Error(`Error al actualizar la cita: ${error.message}`);
        }

        // Notificar al resto de la aplicación que el pago fue procesado
        document.dispatchEvent(new CustomEvent('paymentProcessed', {
            detail: { citaId: currentCitaForPayment.id }
        }));
        
        closePaymentModal();

    } catch (error) {
        console.error(error);
        alert(error.message);
    } finally {
        savePaymentBtn.disabled = false;
        savePaymentBtn.innerHTML = '<i class="fas fa-save"></i> Guardar y Finalizar Cita';
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

    // Listener para mostrar/ocultar el campo de fecha límite
    paymentForm.querySelectorAll('input[name="metodo_pago"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'no_pagado') {
                deadlineContainer.style.display = 'block';
                // Poner la fecha de mañana por defecto para conveniencia
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                deadlineInput.value = tomorrow.toISOString().split('T')[0];
            } else {
                deadlineContainer.style.display = 'none';
            }
        });
    });
}
