/*
 * SCRIPT.JS (Version 10 - Final)
 * - Removed "Compass Analysis" logic.
 * - Final smart error handling.
 * - Final tooltip fixes (in HTML/CSS).
 */

document.addEventListener('DOMContentLoaded', () => {

    // === 1. GET ALL HTML ELEMENTS ===
    const map = L.map('map').setView([20, 0], 2); // Default view
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // --- Tabs ---
    const tabIcao = document.getElementById('tab-icao');
    const tabCoords = document.getElementById('tab-coords');
    const panelIcao = document.getElementById('panel-icao');
    const panelCoords = document.getElementById('panel-coords');

    // --- Inputs ---
    const icaoInput = document.getElementById('icao-input');
    const latInput = document.getElementById('lat-input');
    const lonInput = document.getElementById('lon-input');
    const radiusInput = document.getElementById('radius-input');
    const minAreaInput = document.getElementById('min-area-input');

    // --- Buttons & Status ---
    const submitBtn = document.getElementById('submit-btn');
    const submitBtnText = document.getElementById('submit-btn-text');
    const submitBtnLoader = document.getElementById('submit-btn-loader');
    const statusMessage = document.getElementById('status-message');
    const downloadKmlBtn = document.getElementById('download-kml-btn');
    const downloadCsvBtn = document.getElementById('download-csv-btn');
    const startOverBtn = document.getElementById('start-over-btn');

    // === 2. STATE VARIABLES ===
    const API_ENDPOINT = "http://127.0.0.1:5000/generate-report"; // Our local server!
    let currentInputMode = 'icao';
    let isFetching = false;
    let lastKML = null;
    let lastCSV = null;
    let lastFilenamePrefix = 'report';
    let currentMapLayerGroup = null;
    let mapLegend = null;

    // === 3. EVENT LISTENERS ===

    tabIcao.addEventListener('click', () => {
        currentInputMode = 'icao';
        tabIcao.classList.add('bg-brand-primary', 'text-black');
        tabIcao.classList.remove('bg-brand-secondary', 'text-gray-300');
        tabCoords.classList.add('bg-brand-secondary', 'text-gray-300');
        tabCoords.classList.remove('bg-brand-primary', 'text-black');
        panelIcao.classList.remove('hidden');
        panelCoords.classList.add('hidden');
    });

    tabCoords.addEventListener('click', () => {
        currentInputMode = 'coords';
        tabCoords.classList.add('bg-brand-primary', 'text-black');
        tabCoords.classList.remove('bg-brand-secondary', 'text-gray-300');
        tabIcao.classList.add('bg-brand-secondary', 'text-gray-300');
        tabIcao.classList.remove('bg-brand-primary', 'text-black');
        panelCoords.classList.remove('hidden');
        panelIcao.classList.add('hidden');
    });

    submitBtn.addEventListener('click', () => {
        if (isFetching) return;
        
        lastFilenamePrefix = 'report';

        const data = {
            radius_km: parseFloat(radiusInput.value) || 13.0,
            min_area_sq_m: parseFloat(minAreaInput.value) || 0,
            mode: currentInputMode
        };

        if (currentInputMode === 'icao') {
            data.icao = icaoInput.value.toUpperCase();
            if (data.icao.length !== 4) {
                showStatus("Error: ICAO code must be 4 letters.", 'error');
                return;
            }
            lastFilenamePrefix = data.icao.toLowerCase();
        } else {
            data.lat = parseFloat(latInput.value);
            data.lon = parseFloat(lonInput.value);
            if (isNaN(data.lat) || isNaN(data.lon)) {
                showStatus("Error: Invalid Latitude or Longitude.", 'error');
                return;
            }
            lastFilenamePrefix = `custom_${data.lat.toFixed(2)}_${data.lon.toFixed(2)}`;
        }
        fetchHazardReport(data);
    });

    downloadKmlBtn.addEventListener('click', () => {
        if (lastKML) {
            const filename = `${lastFilenamePrefix}_hazard_report.kml`;
            downloadData(lastKML, filename, 'application/vnd.google-earth.kml+xml');
        }
    });

    downloadCsvBtn.addEventListener('click', () => {
        if (lastCSV) {
            const filename = `${lastFilenamePrefix}_hazard_report.csv`;
            downloadData(lastCSV, filename, 'text/csv');
        }
    });
    
    startOverBtn.addEventListener('click', resetApp);

    // === 4. CORE FUNCTIONS ===

    function resetApp() {
        icaoInput.value = '';
        latInput.value = '';
        lonInput.value = '';
        radiusInput.value = '13';
        minAreaInput.value = '10000';
        
        showStatus("", 'info');
        setLoadingState(false);
        downloadKmlBtn.disabled = true;
        downloadCsvBtn.disabled = true;
        
        lastKML = null;
        lastCSV = null;
        lastFilenamePrefix = 'report';

        if (currentMapLayerGroup) {
            map.removeLayer(currentMapLayerGroup);
            currentMapLayerGroup = null;
        }
        if (mapLegend) {
            map.removeControl(mapLegend);
            mapLegend = null;
        }
        map.setView([20, 0], 2);
    }

    async function fetchHazardReport(data) {
        setLoadingState(true);
        showStatus("Generating report... This may take up to 90 seconds.", 'loading');

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const result = await response.json();
            
            lastKML = result.kml_string;
            lastCSV = result.csv_string;
            
            updateMap(result.map_geojson, result.airport_info.lat, result.airport_info.lon, data.radius_km, data.mode);
            addMapLegend();
            
            // --- REMOVED ANALYSIS SUMMARY ---
            showStatus(
                `Success! Found ${result.feature_count} features.`,
                'success'
            );
            
            downloadKmlBtn.disabled = false;
            downloadCsvBtn.disabled = false;

        } catch (error) {
            console.error('Fetch error:', error);
            const rawError = error.message;
            
            if (rawError.includes("504") || rawError.includes("Gateway Timeout")) {
                showStatus("Error: The OpenStreetMap server (a free service) is temporarily busy. Please click 'Start Over' and try again in a moment.", 'error');
            
            } else if (rawError.includes("5000 elements") || rawError.includes("query aborted")) {
                showStatus("Analysis Failed: The selected area is too complex for a single query. Please try again with a smaller 'Analysis Radius' or a *larger* 'Minimum Hazard Area'.", 'error');
            
            } else if (rawError.includes("not found")) {
                showStatus(`Error: ${rawError}. Please check the ICAO code.`, 'error');

            } else {
                showStatus(`An unknown error occurred: ${rawError}`, 'error');
            }
        } finally {
            setLoadingState(false);
        }
    }

    function updateMap(geojson, lat, lon, radius_km, inputMode) {
        if (currentMapLayerGroup) {
            map.removeLayer(currentMapLayerGroup);
        }
        
        currentMapLayerGroup = L.featureGroup();
        
        const hazardLayer = L.geoJSON(geojson, {
            style: getHazardStyle,
            onEachFeature: (feature, layer) => {
                let popupContent = "<b>Hazard Attractant</b><br><hr>";
                if (feature.properties && feature.properties.tags) {
                    const tags = feature.properties.tags;
                    popupContent += `<b>Name:</b> ${tags.name || 'N/A'}<br>`;
                    popupContent += `<b>Type:</b> ${tags.landuse || tags.natural || 'Unknown'}`;
                }
                layer.bindPopup(popupContent);
            }
        });
        currentMapLayerGroup.addLayer(hazardLayer);

        let iconHtml = '✈️';
        let popupText = '<b>Airport Center (ARP)</b>';
        if (inputMode === 'coords') {
            iconHtml = '📍';
            popupText = '<b>Custom Center Point</b>';
        }

        const marker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'leaflet-div-icon',
                html: iconHtml,
                iconSize: [24, 24]
            })
        }).bindPopup(popupText);
        currentMapLayerGroup.addLayer(marker);
          
        const circleFill = L.circle([lat, lon], {
            radius: radius_km * 1000,
            color: 'transparent',
            fillColor: '#F59E0B',
            fillOpacity: 0.1,
            weight: 0,
            interactive: false
        });
        currentMapLayerGroup.addLayer(circleFill);

        const circleOutline = L.circle([lat, lon], {
            radius: radius_km * 1000,
            color: '#F59E0B',
            fill: false,
            weight: 2,
            interactive: true
        }).bindPopup(`<b>${radius_km}km Analysis Radius</b>`);
        currentMapLayerGroup.addLayer(circleOutline);

        currentMapLayerGroup.addTo(map);
        map.fitBounds(currentMapLayerGroup.getBounds().pad(0.1));
    }
    
    function addMapLegend() {
        if (mapLegend) {
            map.removeControl(mapLegend);
        }
        
        mapLegend = L.control({ position: 'bottomright' });

        mapLegend.onAdd = function (map) {
            const div = L.DomUtil.create('div', 'leaflet-legend');
            let content = '<h4>Legend</h4>';
            const categories = [
                { color: '#0000FF', label: 'Water' },
                { color: '#228B22', label: 'Cropland / Forest' },
                { color: '#8B4513', label: 'Waste / Landfill' },
                { color: '#FFFF00', label: 'Other' }
            ];
            
            categories.forEach(item => {
                content += `
                    <div class="legend-item">
                        <span class="legend-color-box" style="background-color: ${item.color}; opacity: 0.5;"></span>
                        ${item.label}
                    </div>
                `;
            });
            
            div.innerHTML = content;
            return div;
        };

        mapLegend.addTo(map);
    }

    // === 5. HELPER FUNCTIONS ===
    
    function getHazardStyle(feature) {
        let color = '#FFFF00'; // Default (yellow)
        if (feature.properties && feature.properties.tags) {
            const tags = feature.properties.tags;
            if (tags.natural === 'water' || tags.landuse === 'reservoir') {
                color = '#0000FF'; // Blue
            } else if (tags.landuse === 'farmland' || tags.natural === 'wood' || tags.landuse === 'forest') {
                color = '#228B22'; // Green
            } else if (tags.landuse === 'landfill' || tags.amenity === 'waste_disposal' || tags.man_made === 'wastewater_plant') {
                color = '#8B4513';
            }
        }
        return {
            color: color,
            weight: 2,
            opacity: 0.8,
            fillColor: color,
            fillOpacity: 0.3
        };
    }

    function downloadData(data, filename, type) {
        const blob = new Blob([data], { type: type });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function setLoadingState(isLoading) {
        isFetching = isLoading;
        submitBtn.disabled = isLoading;
        if (isLoading) {
            submitBtnText.classList.add('hidden');
            submitBtnLoader.classList.remove('hidden');
            downloadKmlBtn.disabled = true;
            downloadCsvBtn.disabled = true;
        } else {
            submitBtnText.classList.remove('hidden');
            submitBtnLoader.classList.add('hidden');
        }
    }

    // --- UPDATED: This function no longer shows the analysis summary ---
    function showStatus(message, type = 'info') {
        let html = `<span class="block">${message}</span>`;
        
        statusMessage.innerHTML = html;
        statusMessage.className = "mt-4 text-sm font-medium h-auto min-h-[1rem] text-center";
        
        switch (type) {
            case 'error':
                statusMessage.classList.add('text-red-500');
                break;
            case 'success':
                statusMessage.classList.add('text-green-400');
                break;
            case 'loading':
                statusMessage.classList.add('text-blue-400');
                break;
            default:
                statusMessage.classList.add('text-gray-400');
        }
    }
    
    // Initialize the app on load
    resetApp();
});