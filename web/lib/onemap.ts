import type L from "leaflet";

// OneMap (Singapore Land Authority) basemap. Its terms require the OneMap logo and this
// attribution, verbatim from https://www.onemap.gov.sg/docs/maps/resources/code-attr.txt
export const ONEMAP_TILES = "https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png";
export const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;" alt=""/>&nbsp;' +
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
// Bounds and zoom range from OneMap's own Leaflet example.
export const MAX_BOUNDS: L.LatLngBoundsExpression = [[1.144, 103.535], [1.494, 104.502]];
