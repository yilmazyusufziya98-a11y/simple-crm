// Address lookup shared by the desktop app (main process) and the web version.
// With a Google API key: Google Places API (New). Without: OpenStreetMap (Photon).

// Centre of York Region, so nearby results come first
const AREA = { lat: 43.87, lng: -79.43 };

async function searchAddress(query, apiKey) {
  if (!query || query.trim().length < 3) return [];
  if (apiKey) {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["ca"],
        includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
        locationBias: { circle: { center: { latitude: AREA.lat, longitude: AREA.lng }, radius: 40000 } },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? `Google error ${res.status}`);
    return (json.suggestions ?? []).filter(s => s.placePrediction).map(s => ({
      label: s.placePrediction.text.text,
      placeId: s.placePrediction.placeId,
    }));
  }
  // Free fallback: OpenStreetMap (Photon). No key needed, less complete than Google.
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${AREA.lat}&lon=${AREA.lng}&limit=6&lang=en&layer=house&layer=street`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Address search error ${res.status}`);
  const json = await res.json();
  return json.features
    .map(f => f.properties)
    .filter(p => p.countrycode === "CA")
    .map(p => {
      const street = [p.housenumber, p.street ?? p.name].filter(Boolean).join(" ");
      const city = p.city ?? p.town ?? p.village ?? p.district ?? "";
      const province = p.state === "Ontario" ? "ON" : p.state ?? "";
      // OpenStreetMap postal codes are often wrong in Canada, so they're left out
      return { label: [street, city, province].filter(Boolean).join(", "), street, city, province, postalCode: "" };
    });
}

// Google autocomplete only returns a short text; fetch the full address (with postal code) for the chosen one
async function addressDetails(placeId, apiKey) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "formattedAddress,addressComponents" },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? `Google error ${res.status}`);
  const component = type => json.addressComponents?.find(c => c.types.includes(type));
  const long = type => component(type)?.longText ?? "";
  const unit = long("subpremise");
  const street = [long("street_number"), long("route")].filter(Boolean).join(" ");
  return {
    label: json.formattedAddress.replace(/, Canada$/, ""),
    street: unit ? `${unit}-${street}` : street,
    city: long("locality") || long("sublocality") || long("neighborhood"),
    province: component("administrative_area_level_1")?.shortText ?? "",
    postalCode: long("postal_code"),
  };
}

module.exports = { searchAddress, addressDetails };
