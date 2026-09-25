# Google Maps for attendance

The shared `StreetMap` component uses Google's Maps JavaScript API: an actual road map, blue centre geofence, orange clock-point marker, and GPS accuracy circle. It shows an explicit setup/error state rather than a substitute diagram when Maps is unavailable. Geofence enforcement remains in PostgreSQL; the map does not decide clock-in eligibility.

## Account owner setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a company-owned project.
2. Link a billing account. The account owner must accept any billing terms. Set budget alerts and suitable API quotas; alerts alone do not impose a spending cap.
3. Enable **Maps JavaScript API**. This implementation does not need Places, Routes or Geocoding APIs.
4. Create a browser API key. Restrict its application usage to **Websites (HTTP referrers)**, including `https://rdp-platform-rouge.vercel.app/*` and only your other actual production domains. Avoid wildcard access to all Vercel domains. Use a separate development key for `http://localhost:3100/*` and `http://127.0.0.1:3100/*` if needed.
5. Restrict its API usage to **Maps JavaScript API**.
6. In the existing Vercel project, add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to the Production environment and redeploy. Browser keys are visible in the delivered app by design; the domain and API restrictions are essential. Do not paste keys into chat or commit them to Git.
7. In Schedule → Sites & centres, enter verified entrance latitude/longitude and the permitted radius for each centre. Do not guess pool entrances or silently substitute demo positions.
8. Open Time clock & timesheets. Check the boundary on the street map, then pilot one real assigned shift on-site with the staff member's consent to capture their location.

Google receives map requests and the displayed viewport. Precise attendance coordinates are stored in your Supabase project and visible only to the staff member and scheduling managers. Establish a staff notice and retention policy before broad rollout. No background location tracking is implemented.

Official references: [API setup](https://developers.google.com/maps/documentation/javascript/get-api-key), [usage and billing](https://developers.google.com/maps/documentation/javascript/usage-and-billing), [API security](https://developers.google.com/maps/api-security-best-practices).
