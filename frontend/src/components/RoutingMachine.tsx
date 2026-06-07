'use client';
import { useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet-routing-machine';
import { Polyline } from 'react-leaflet';

interface RoutingMachineProps {
  start: [number, number];
  end: [number, number];
}

export default function RoutingMachine({ start, end }: RoutingMachineProps) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

  useEffect(() => {
    // Create a headless OSRM router
    const router = L.Routing.osrmv1();
    
    router.route([
      L.Routing.waypoint(L.latLng(start[0], start[1])),
      L.Routing.waypoint(L.latLng(end[0], end[1]))
    ], (err: any, routes: any) => {
      if (!err && routes && routes.length > 0) {
        const coords = routes[0].coordinates.map((c: any) => [c.lat, c.lng]);
        setRouteCoords(coords);
      }
    });
  }, [start, end]);

  if (routeCoords.length === 0) return null;

  return (
    <Polyline 
      positions={routeCoords} 
      color="#6366f1" 
      weight={6} 
      opacity={0.8}
      pathOptions={{ lineCap: 'round', lineJoin: 'round' }}
    />
  );
}
