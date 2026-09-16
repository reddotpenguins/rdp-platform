import type {Site} from './attendance';
export function siteError(site:Site,sites:Site[]):string|null {
 if(!site.name.trim()||site.name.trim().length>60)return 'Enter a centre name of up to 60 characters.';
 if(sites.some(s=>s.id!==site.id&&s.name.trim().toLowerCase()===site.name.trim().toLowerCase()))return 'A centre with this name already exists.';
 if(!Number.isFinite(site.radius)||site.radius<20||site.radius>1000)return 'Choose a radius between 20 and 1,000 metres.';
 if(site.configured&&(!Number.isFinite(site.latitude)||!Number.isFinite(site.longitude)||Math.abs(site.latitude)>90||Math.abs(site.longitude)>180))return 'Enter valid latitude and longitude coordinates.';
 return null;
}
export function readSavedSites(raw:string|null):Site[]|null {
 try {const value:unknown=JSON.parse(raw||'null');if(!Array.isArray(value)||!value.length||value.length>100)return null;
 const sites=value as Site[];
 if(sites.some(s=>!s||typeof s.id!=='string'||typeof s.name!=='string'||typeof s.tagCode!=='string'||typeof s.configured!=='boolean'||typeof s.latitude!=='number'||typeof s.longitude!=='number'||(s.address!==undefined&&typeof s.address!=='string')||siteError(s,sites)))return null;
 if(new Set(sites.map(s=>s.id)).size!==sites.length||new Set(sites.map(s=>s.tagCode)).size!==sites.length)return null;
 return sites;
 }catch{return null;}
}
