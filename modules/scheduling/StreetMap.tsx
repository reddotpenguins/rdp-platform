'use client';
import {useEffect,useRef,useState} from 'react';

type Point={latitude:number;longitude:number;accuracy?:number};
type LatLng={lat:number;lng:number};
type Bounds={extend:(point:LatLng)=>void};
type MapInstance={fitBounds:(bounds:Bounds,padding:number)=>void};
type Overlay={setMap:(map:MapInstance|null)=>void;getBounds:()=>Bounds|null};
type Maps={Map:new(element:HTMLElement,options:object)=>MapInstance;Circle:new(options:object)=>Overlay};
type GoogleWindow=Window & {google?:{maps:Maps};rdpMapsReady?:()=>void;gm_authFailure?:()=>void};
let loading:Promise<Maps>|undefined;
function loadMaps(key:string){
 if(!loading)loading=new Promise<Maps>((resolve,reject)=>{
  const target=window as GoogleWindow;
  if(target.google?.maps){resolve(target.google.maps);return;}
  const timeout=window.setTimeout(()=>reject(new Error('Google Maps timed out. Check your connection and map configuration.')),20000);
  target.rdpMapsReady=()=>{clearTimeout(timeout);if(target.google?.maps)resolve(target.google.maps);else reject(new Error('Google Maps did not initialise.'));};
  target.gm_authFailure=()=>{clearTimeout(timeout);reject(new Error('Google Maps could not authorise this domain. Check the key, API restrictions and billing.'));};
  const script=document.createElement('script');script.async=true;
  script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=rdpMapsReady&loading=async&v=quarterly`;
  script.onerror=()=>{clearTimeout(timeout);reject(new Error('Google Maps could not load. Check your connection.'));};
  document.head.appendChild(script);
 });
 return loading;
}
export default function StreetMap({centre,radius,point,label}:{centre:Point|null;radius:number;point?:Point|null;label:string}){
 const ref=useRef<HTMLDivElement>(null);const [error,setError]=useState('');const [ready,setReady]=useState(false);
 const key=process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
 const lat=centre?.latitude,lng=centre?.longitude,pLat=point?.latitude,pLng=point?.longitude,accuracy=point?.accuracy||0;
 useEffect(()=>{
  if(!key||lat===undefined||lng===undefined||!ref.current)return;
  let cancelled=false;const overlays:Overlay[]=[];setReady(false);setError('');
  loadMaps(key).then(maps=>{
   if(cancelled||!ref.current)return;
   const centre={lat,lng};const map=new maps.Map(ref.current,{center:centre,zoom:17,mapTypeId:'roadmap',streetViewControl:false,mapTypeControl:true,fullscreenControl:true});
   const fence=new maps.Circle({map,center:centre,radius,strokeColor:'#2563eb',strokeWeight:2,fillColor:'#2563eb',fillOpacity:0.12});overlays.push(fence);
   const bounds=fence.getBounds();
   overlays.push(new maps.Circle({map,center:centre,radius:3,fillColor:'#2563eb',fillOpacity:1,strokeWeight:1}));
   if(pLat!==undefined&&pLng!==undefined){const position={lat:pLat,lng:pLng};const gps=new maps.Circle({map,center:position,radius:Math.max(accuracy,3),strokeColor:'#d97706',strokeWeight:1,fillColor:'#f59e0b',fillOpacity:0.16});overlays.push(gps,new maps.Circle({map,center:position,radius:4,fillColor:'#d97706',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}));bounds?.extend(position);}
   if(bounds)map.fitBounds(bounds,45);setReady(true);
  }).catch(e=>{if(!cancelled)setError(e.message);});
  return()=>{cancelled=true;overlays.forEach(o=>o.setMap(null));};
 },[key,lat,lng,radius,pLat,pLng,accuracy]);
 const fallback=lat===undefined?'Set the centre’s entrance coordinates to display its map.':!key?'Google Maps setup required. Add the restricted Maps API key to activate the street map.':error;
 return <section aria-label={`${label} street map`}><div ref={ref} style={{height:fallback?0:340,width:'100%',borderRadius:10}}/>{fallback?<p role="status" style={{padding:24,background:'#eff4fa'}}>{fallback}</p>:!ready?<p role="status">Loading street map…</p>:null}{ready&&<p style={{padding:10,fontSize:12}}>Blue: centre boundary · Orange: recorded location and GPS accuracy. Location evidence is checked separately on the server.</p>}</section>;
}
