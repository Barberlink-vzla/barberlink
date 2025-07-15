// js/report-charts.js

const ReportCharts = {
    charts: {}, // Objeto para almacenar las instancias de los gráficos

    /**
     * Renderiza o actualiza un gráfico de área de ApexCharts.
     * @param {object} config - La configuración del gráfico.
     */
    renderChart: function(config) {
        const { chartId, series, categories, themeColor } = config;

        const options = {
            chart: {
                type: 'area',
                height: 150,
                sparkline: { enabled: true },
                animations: { easing: 'easeinout', speed: 600 },
                background: 'transparent'
            },
            stroke: {
                curve: 'smooth',
                width: 2
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.5,
                    opacityTo: 0.1,
                    stops: [0, 90, 100]
                }
            },
            series: [{
                name: 'Valor',
                data: series
            }],
            xaxis: {
                categories: categories,
                labels: { show: false },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: {
                show: false,
                min: 0
            },
            grid: {
                show: false,
                padding: { left: 5, right: 5, top: 10, bottom: 10 }
            },
            tooltip: {
                enabled: true,
                x: { show: false },
                y: {
                    formatter: function (val) {
                        return (config.prefix || '') + val.toFixed(config.decimals !== undefined ? config.decimals : 0);
                    }
                },
                marker: { show: false },
                theme: 'dark'
            },
            colors: [themeColor || '#008FFB'],
            theme: { mode: 'dark' }
        };

        if (this.charts[chartId]) {
            // Si el gráfico ya existe, se actualiza
            this.charts[chartId].updateOptions(options);
        } else {
            // Si no existe, se crea uno nuevo
            const chart = new ApexCharts(document.querySelector(`#${chartId}`), options);
            chart.render();
            this.charts[chartId] = chart;
        }
        
        // Actualiza la información de texto (total y porcentaje) asociada al gráfico
        this.updateChartInfo(config);
    },

    /**
     * Actualiza solo los elementos de texto (total y porcentaje) asociados a un gráfico.
     * @param {object} config - La configuración con los nuevos valores.
     */
    updateChartInfo: function(config) {
        const valueEl = document.getElementById(config.valueElId);
        const percentageEl = document.getElementById(config.percentageElId);

        if (valueEl) {
            valueEl.textContent = `${config.prefix || ''}${(config.total || 0).toFixed(config.decimals !== undefined ? config.decimals : 0)}`;
        }
        if (percentageEl) {
            percentageEl.classList.remove('positive', 'negative', 'neutral');
            const perc = config.percentage;
            let iconTransform = 'rotate(0deg)';
            let colorClass = 'neutral';
            
            if (perc > 0.1) {
                colorClass = 'positive';
            } else if (perc < -0.1) {
                colorClass = 'negative';
                iconTransform = 'rotate(180deg)';
            }

            percentageEl.classList.add(colorClass);
            const arrowSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; margin-right: 5px; transform: ${iconTransform}; transition: transform 0.4s ease;"><path d="M12 4L18 10M12 20V4M12 4L6 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
            percentageEl.innerHTML = `${arrowSVG}<span>${perc.toFixed(1)}%</span>`;
        }
    }
};
