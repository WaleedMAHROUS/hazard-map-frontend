/* SCRIPT.JS (Corrected Version with Distance Display) */
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
    let downloadName = "Custom"; 

    // Tab Logic
    document.getElementById('tab-icao').onclick = () => setMode('icao');
    document.getElementById('tab-coords').onclick = () => setMode('coords');
    function setMode(m) {
        mode = m;
        document.getElementById('panel-icao').classList.toggle('hidden', m !== 'icao');
        document.getElementById('panel-coords').classList.toggle('hidden', m === 'icao');
    }

    // Helper function to calculate distance between two points (Haversine formula)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    // Main Logic
    els.submit.onclick = async () => {
        els.submit.disabled = true;
        els.status.innerHTML = "Scanning... (Wait 30-60s)";
        els.status.className = "mt-4 text-center text-blue-400";
        
        try {
            const payload = {
                radius_km: parseFloat(els.radius.value) || 13,
                min_area_sq_m: els.minArea.value === '' ? 5000 : parseFloat(els.minArea.value),
                mode: mode,
                icao: els.icao.value,
                lat: els.lat.value,
                lon: els.lon.value
            };

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
            
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Server Connection Failed");
            }

            lastKML = data.kml_string;
            lastCSV = data.csv_string;
            
            // Map Drawing
            if(layerGroup) map.removeLayer(layerGroup);
            layerGroup = L.featureGroup();
            
            const featureCount = data.map_geojson.features.length;
            console.log(`Received ${featureCount} features from backend`);
            
            if (featureCount === 0) {
                alert("No hazards found matching your criteria. Try reducing the minimum area filter.");
            }

            let addedFeatures = 0;
            let skippedFeatures = 0;

            const arpLat = data.airport_info.lat;
            const arpLon = data.airport_info.lon;

            // Process each feature with better error handling
            data.map_geojson.features.forEach((feature, index) => {
                try {
                    const geojsonLayer = L.geoJSON(feature, {
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
                            
                            // Calculate distance from ARP to feature centroid
                            const featureLayer = l.toGeoJSON();
                            let featureLat, featureLon;
                            
                            // Get centroid coordinates based on geometry type
                            if (featureLayer.geometry.type === 'Polygon') {
                                const coords = featureLayer.geometry.coordinates[0];
                                const sumLat = coords.reduce((sum, c) => sum + c[1], 0);
                                const sumLon = coords.reduce((sum, c) => sum + c[0], 0);
                                featureLat = sumLat / coords.length;
                                featureLon = sumLon / coords.length;
                            } else if (featureLayer.geometry.type === 'MultiPolygon') {
                                const coords = featureLayer.geometry.coordinates[0][0];
                                const sumLat = coords.reduce((sum, c) => sum + c[1], 0);
                                const sumLon = coords.reduce((sum, c) => sum + c[0], 0);
                                featureLat = sumLat / coords.length;
                                featureLon = sumLon / coords.length;
                            } else if (featureLayer.geometry.type === 'Point') {
                                featureLon = featureLayer.geometry.coordinates[0];
                                featureLat = featureLayer.geometry.coordinates[1];
                            } else {
                                // Default fallback
                                featureLat = arpLat;
                                featureLon = arpLon;
                            }
                            
                            const distance = calculateDistance(arpLat, arpLon, featureLat, featureLon);
                            
                            l.bindPopup(`<b>${name}</b><br>Area: ${Math.round(f.properties.area_sq_m).toLocaleString()} m²<br><b>Distance from ARP:</b> ${distance.toFixed(2)} km`);
                        }
                    });
                    
                    // Only add if the layer was successfully created
                    if (geojsonLayer.getLayers().length > 0) {
                        geojsonLayer.addTo(layerGroup);
                        addedFeatures++;
                    } else {
                        skippedFeatures++;
                        console.warn(`Feature ${index} created no layers`);
                    }
                } catch (error) {
                    skippedFeatures++;
                    console.error(`Error adding feature ${index}:`, error);
                }
            });
            
            console.log(`Added ${addedFeatures} features to map, skipped ${skippedFeatures}`);
            
            // ARP & Radius
            const center = [data.airport_info.lat, data.airport_info.lon];
            L.marker(center).addTo(layerGroup).bindPopup(`<b>ARP: ${data.airport_info.name}</b><br>Coordinates: ${center[0].toFixed(4)}, ${center[1].toFixed(4)}`);
            
            // Circle with interactive: false to allow clicks to pass through
            L.circle(center, {
                radius: payload.radius_km * 1000, 
                color: 'red', 
                fill: false, 
                weight: 2,
                interactive: false 
            }).addTo(layerGroup);
            
            layerGroup.addTo(map);
            map.fitBounds(layerGroup.getBounds());
            
            // More informative success message
            const displayMsg = addedFeatures === data.feature_count 
                ? `Success! Found and displayed ${data.feature_count} features.`
                : `Success! Found ${data.feature_count} features (${addedFeatures} displayed on map).`;
            
            els.status.innerHTML = displayMsg;
            els.status.className = "mt-4 text-center text-green-400";
            els.kml.disabled = false;
            els.csv.disabled = false;
            
        } catch (e) {
            console.error(e);
            els.status.innerHTML = "Error: " + e.message;
            els.status.className = "mt-4 text-center text-red-500";
        } finally {
            els.submit.disabled = false;
        }
    };

    const download = (d, ext) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([d]));
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `${dateStr}_Scanned_Hazards_${downloadName}.${ext}`;
        a.click();
    };
    els.csv.onclick = () => download(lastCSV, 'csv');
    els.kml.onclick = () => download(lastKML, 'kml');
    
    // Modal
    document.getElementById('about-btn').onclick = () => document.getElementById('about-modal').classList.remove('hidden');
    document.getElementById('close-about-btn').onclick = () => document.getElementById('about-modal').classList.add('hidden');
    
    // Start Over functionality
    const startOverBtn = document.querySelector('a[href*="Start Over"]') || 
                         document.getElementById('start-over-btn') ||
                         Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Start Over'));
    
    if (startOverBtn) {
        startOverBtn.onclick = (e) => {
            e.preventDefault();
            
            // Clear all inputs
            els.icao.value = '';
            els.lat.value = '';
            els.lon.value = '';
            els.radius.value = '13';
            els.minArea.value = '10000';
            
            // Clear map layers
            if (layerGroup) {
                map.removeLayer(layerGroup);
                layerGroup = null;
            }
            
            // Reset map view
            map.setView([20, 0], 2);
            
            // Clear status message
            els.status.innerHTML = '';
            els.status.className = 'mt-4 text-center';
            
            // Disable download buttons
            els.kml.disabled = true;
            els.csv.disabled = true;
            
            // Clear stored data
            lastKML = null;
            lastCSV = null;
            downloadName = "Custom";
            
            // Switch to ICAO tab
            setMode('icao');
        };
    }
});