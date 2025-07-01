// js/report-charts.js

const ReportCharts = {
    charts: {}, // Almacenar instancias de gráficos para actualizarlas

    /**
     * Anima un valor numérico de un punto a otro.
     * @param {HTMLElement} el El elemento cuyo textContent será animado.
     * @param {number} start El valor inicial.
     * @param {number} end El valor final.
     * @param {number} duration La duración de la animación en ms.
     * @param {string} prefix Prefijo a añadir al valor (ej. '$').
     * @param {number} decimals Número de decimales a mostrar.
     */
    animateValue(el, start, end, duration, prefix = '', decimals = 0) {
        if (!el) return;
        if (start === end) {
            el.textContent = `${prefix}${end.toFixed(decimals)}`;
            return;
        }

        const range = end - start;
        let current = start;
        const increment = end > start ? 1 : -1;
        const stepTime = Math.abs(Math.floor(duration / range));

        const timer = setInterval(() => {
            current += increment * (Math.abs(end - current) > 100 ? 15 : (Math.abs(end-current) > 10 ? 3: 1) ) ;
             if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                current = end;
                clearInterval(timer);
            }
            el.textContent = `${prefix}${current.toFixed(decimals)}`;
        }, 5);
         el.textContent = `${prefix}${start.toFixed(decimals)}`;
    },

    /**
     * Renderiza o actualiza un gráfico de reporte.
     * @param {object} config - Objeto de configuración para el gráfico.
     */
    renderChart(config) {
        const {
            chartId,
            series,
            categories,
            total,
            percentage,
            valueElId,
            percentageElId,
            prefix = '',
            decimals = 0,
            themeColor = '#c5a686'
        } = config;

        const valueEl = document.getElementById(valueElId);
        const percentageEl = document.getElementById(percentageElId);
        const chartEl = document.getElementById(chartId);

        if (!chartEl || !valueEl || !percentageEl) {
            console.error(`Elementos del DOM no encontrados para el gráfico ${chartId}`);
            return;
        }

        // --- Animar valor y porcentaje ---
        const currentTotal = parseFloat(valueEl.textContent.replace(prefix, '')) || 0;
        this.animateValue(valueEl, currentTotal, total, 1500, prefix, decimals);
        
        percentageEl.classList.remove('positive', 'negative', 'neutral');
        const arrowSvg = percentageEl.querySelector('svg');
        
        if (percentage > 0) {
            percentageEl.classList.add('positive');
            if (arrowSvg) arrowSvg.style.transform = 'rotate(0deg)';
        } else if (percentage < 0) {
            percentageEl.classList.add('negative');
            if (arrowSvg) arrowSvg.style.transform = 'rotate(180deg)';
        } else {
            percentageEl.classList.add('neutral');
        }
        percentageEl.querySelector('span').textContent = `${Math.abs(percentage).toFixed(0)}%`;


        // --- Opciones del gráfico ---
        const options = {
            series: [{
                name: 'Valor',
                data: series,
            }],
            chart: {
                type: 'area',
                
                sparkline: { enabled: true },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800,
                    animateGradually: { enabled: true, delay: 150 },
                    dynamicAnimation: { enabled: true, speed: 350 }
                }
            },
            stroke: {
                curve: 'smooth',
                width: 3,
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shade: 'dark',
                    type: "vertical",
                    shadeIntensity: 0.5,
                    gradientToColors: [themeColor],
                    inverseColors: true,
                    opacityFrom: 0.6,
                    opacityTo: 0.1,
                    stops: [0, 90, 100],
                }
            },
            tooltip: {
                enabled: true,
                theme: 'dark',
                x: { show: false },
                 y: {
                    formatter: (val) => `${prefix}${val.toFixed(decimals)}`,
                },
                marker: {
                    show: false,
                },
            },
            colors: [themeColor],
            xaxis: {
                categories: categories,
            },
        };

        // --- Renderizar o actualizar ---
        if (this.charts[chartId]) {
            this.charts[chartId].updateOptions(options);
        } else {
            const chart = new ApexCharts(chartEl, options);
            chart.render();
            this.charts[chartId] = chart;
        }
    }
};
