/* SCRIPT.JS (Final Production) */
document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map', { preferCanvas: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);

    const els = {
        icao: document.getElementById('icao-input'),
        lat: document.getElementById('lat-input'),
        lon: document.getElementById('lon-input'),
        radius: document.getElementById('radius-input'),
        minArea: document.getElementById('min-area-input'),
        submit: document.getElementById('submit-btn'),
        kml: document.getElementById('download-kml-btn'),
        csv: document.getElementById('download-csv-btn'),
        status: document.getElementById('status-message')
    };
    
    const API_ENDPOINT = "https://hazard-map-backend.onrender.com/generate-report";
    let layerGroup, lastKML, lastCSV, mode = 'icao';
    let downloadName = "Custom"; // Default name

    // Tab Logic
    document.getElementById('tab-icao').onclick = () => setMode('icao');
    document.getElementById('tab-coords').onclick = () => setMode('coords');
    function setMode(m) {
        mode = m;
        document.getElementById('panel-icao').classList.toggle('hidden', m !== 'icao');
        document.getElementById('panel-coords').classList.toggle('hidden', m === 'icao');
    }

    // Main Logic
    els.submit.onclick = async () => {
        els.submit.disabled = true;
        els.status.innerHTML = "Scanning... (Wait 30-60s)";
        els.status.className = "mt-4 text-center text-blue-400";
        
        try {
            const payload = {
                radius_km: parseFloat(els.radius.value) || 13,
                min_area_sq_m: parseFloat(els.minArea.value) || 5000,
                mode: mode,
                icao: els.icao.value,
                lat: els.lat.value,
                lon: els.lon.value
            };

            // Set Correct Filename
            if (mode === 'icao') {
                downloadName = payload.icao.toUpperCase();
            } else {
                downloadName = `Custom_${payload.lat}_${payload.lon}`;
            }

            const res = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Server Error");
            const data = await res.json();

            lastKML = data.kml_string;
            lastCSV = data.csv_string;
            
            // Map Drawing
            if(layerGroup) map.removeLayer(layerGroup);
            layerGroup = L.featureGroup();
            
            L.geoJSON(data.map_geojson, {
                style: f => {
                    const t = f.properties.custom_type;
                    let c = '#8B4513'; // Brown (Waste)
                    if(t === 'water') c = '#3B82F6'; // Blue
                    if(t === 'veg') c = '#10B981';   // Green
                    return { color: c, weight: 1, fillOpacity: 0.6 };
                },
                onEachFeature: (f, l) => {
                    let name = "Industrial/Waste";
                    if(f.properties.custom_type === 'water') name = "Water Body";
                    if(f.properties.custom_type === 'veg') name = "Vegetation";
                    l.bindPopup(`<b>${name}</b><br>Area: ${Math.round(f.properties.area_sq_m).toLocaleString()} m²`);
                }
            }).addTo(layerGroup);
            
            // ARP & Radius
            const center = [data.airport_info.lat, data.airport_info.lon];
            L.marker(center).addTo(layerGroup).bindPopup("ARP");
            L.circle(center, {radius: payload.radius_km * 1000, color: 'red', fill: false, weight: 2}).addTo(layerGroup);
            
            layerGroup.addTo(map);
            map.fitBounds(layerGroup.getBounds());
            
            els.status.innerHTML = `Success! Found ${data.feature_count} features.`;
            els.status.className = "mt-4 text-center text-green-400";
            els.kml.disabled = false;
            els.csv.disabled = false;
            
        } catch (e) {
            els.status.innerHTML = "Error: " + e.message;
            els.status.className = "mt-4 text-center text-red-500";
        } finally {
            els.submit.disabled = false;
        }
    };

    const download = (d, ext) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([d]));
        // Format: YYYY-MM-DD_Scanned_Hazards_ICAO.kml
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `${dateStr}_Scanned_Hazards_${downloadName}.${ext}`;
        a.click();
    };
    els.csv.onclick = () => download(lastCSV, 'csv');
    els.kml.onclick = () => download(lastKML, 'kml');
    
    // Modal
    document.getElementById('about-btn').onclick = () => document.getElementById('about-modal').classList.remove('hidden');
    document.getElementById('close-about-btn').onclick = () => document.getElementById('about-modal').classList.add('hidden');
});