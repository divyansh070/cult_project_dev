import { create } from 'zustand';
import { socket } from '@/lib/socket';
import { toast } from 'react-hot-toast';

export interface Ride {
  id: string;
  status: string;
  driverId?: string;
  driver?: { name?: string; phone?: string; [key: string]: unknown };
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  pickupLocation?: string;
  dropLocation?: string;
  scheduledAt?: string | Date;
  completedAt?: string | Date;
  waitingStartTime?: string | Date;
  fare?: number | null;
  passenger?: { name?: string; phone?: string; [key: string]: unknown };
  feedback?: { rating: number; comment?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface DriverStats {
  totalRides: number;
  totalEarnings: number;
  averageRating: number;
  rideHistory: Ride[];
  [key: string]: unknown;
}

export interface InAppNotification {
  id: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface SocketState {
  isConnected: boolean;
  onlineDrivers: Record<string, boolean>;
  incomingRides: Ride[];
  activeRides: Ride[];
  driverStats: DriverStats | null;
  driverLocations: Record<string, { lat: number, lng: number, name?: string, phone?: string }>;
  
  // Passenger selection for booking & pinning
  passengerSelection: {
    pickupName: string;
    pickupLat: number | null;
    pickupLng: number | null;
    dropName: string;
    dropLat: number | null;
    dropLng: number | null;
    selectingField: 'pickup' | 'drop' | null;
  };
  setPassengerSelection: (selection: Partial<SocketState['passengerSelection']>) => void;
  resetPassengerSelection: () => void;

  // In-app Notifications
  notifications: InAppNotification[];
  addNotification: (message: string) => void;
  markNotificationsAsRead: () => void;
  clearNotifications: () => void;

  connect: (token: string) => void;
  disconnect: () => void;
  addActiveRide: (ride: Ride) => void;
  removeActiveRide: (rideId: string) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  isConnected: false,
  onlineDrivers: {},
  incomingRides: [],
  activeRides: [],
  driverStats: null,
  driverLocations: {},
  notifications: [],

  passengerSelection: {
    pickupName: '',
    pickupLat: null,
    pickupLng: null,
    dropName: '',
    dropLat: null,
    dropLng: null,
    selectingField: null,
  },

  setPassengerSelection: (selection) => set((state) => ({
    passengerSelection: { ...state.passengerSelection, ...selection }
  })),

  resetPassengerSelection: () => set({
    passengerSelection: {
      pickupName: '',
      pickupLat: null,
      pickupLng: null,
      dropName: '',
      dropLat: null,
      dropLng: null,
      selectingField: null,
    }
  }),

  addNotification: (message) => set((state) => ({
    notifications: [
      {
        id: Math.random().toString(),
        message,
        timestamp: new Date(),
        read: false
      },
      ...state.notifications
    ]
  })),

  markNotificationsAsRead: () => set((state) => ({
    notifications: state.notifications.map(n => ({ ...n, read: true }))
  })),

  clearNotifications: () => set({ notifications: [] }),
  
  addActiveRide: (ride) => set((state) => ({ activeRides: [...state.activeRides.filter(r => r.id !== ride.id), ride] })),
  removeActiveRide: (rideId) => set((state) => ({ activeRides: state.activeRides.filter((r) => r.id !== rideId) })),
  
  connect: (token: string) => {
    if (socket.connected) return;
    
    socket.off('connect');
    socket.off('disconnect');
    socket.off('initial_drivers_state');
    socket.off('driver_status_change');
    socket.off('new_ride_request');
    socket.off('ride_removed');
    socket.off('ride_accepted');
    socket.off('ride_arrived');
    socket.off('ride_started');
    socket.off('ride_completed');
    socket.off('ride_cancelled');
    socket.off('ride_timeout');
    socket.off('restore_active_rides');
    socket.off('initial_pending_rides');
    socket.off('initial_driver_stats');
    socket.off('all_driver_locations');
    socket.off('in_app_notification');
    socket.off('refresh_stats_trigger');
    
    socket.auth = { token };
    socket.connect();
    
    socket.on('connect', () => {
      set({ isConnected: true });
    });
    
    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('initial_drivers_state', (driverIds: string[]) => {
      set(() => {
        const newDrivers: Record<string, boolean> = {};
        driverIds.forEach(id => { newDrivers[id] = true; });
        return { onlineDrivers: newDrivers };
      });
    });

    socket.on('driver_status_change', (data: { driverId: string; isOnline: boolean }) => {
      set((state) => {
        const newDrivers = { ...state.onlineDrivers };
        if (data.isOnline) {
          newDrivers[data.driverId] = true;
        } else {
          delete newDrivers[data.driverId];
        }
        return { onlineDrivers: newDrivers };
      });
    });

    socket.on('new_ride_request', (ride) => {
      set((state) => ({ incomingRides: [...state.incomingRides, ride] }));
      toast.success('New ride dispatch available!', { icon: '📡' });
    });

    socket.on('ride_removed', (data: { rideId: string }) => {
      set((state) => ({
        incomingRides: state.incomingRides.filter((r) => r.id !== data.rideId)
      }));
    });

    socket.on('ride_accepted', (data: any) => {
      const rideId = data.id || data._id;
      set((state) => ({
        activeRides: state.activeRides.map(r => (r.id === rideId || (r as any)._id === rideId) ? { ...r, ...data, status: 'ACCEPTED', id: rideId } : r)
      }));
      toast.success('A driver has accepted your ride!', { icon: '🚘' });
      
      const msg = `Driver ${data.driver?.name || 'Assigned'} has accepted your ride request.`;
      set((state) => ({
        notifications: [{ id: Math.random().toString(), message: msg, timestamp: new Date(), read: false }, ...state.notifications]
      }));
    });

    socket.on('driver_cancelled_rebooking', (data: any) => {
      const rideId = data.id || data._id;
      set((state) => ({
        activeRides: state.activeRides.map(r => (r.id === rideId || (r as any)._id === rideId) ? { ...r, status: 'REQUESTED', driverId: undefined, driver: undefined } : r)
      }));
      toast.error('The assigned driver had to cancel. We are searching for a new driver!', { icon: '🔄', duration: 5000 });
      set((state) => ({
        notifications: [{ id: Math.random().toString(), message: 'Your driver cancelled the trip. Broadcasting request to other drivers again.', timestamp: new Date(), read: false }, ...state.notifications]
      }));
    });

    socket.on('ride_timeout', (data: { rideId: string }) => {
      set((state) => ({
        activeRides: state.activeRides.filter((r) => r.id !== data.rideId)
      }));
      toast.error('No drivers accepted your ride. Please try again.', { icon: '⏳', duration: 5000 });
      set((state) => ({
        notifications: [{ id: Math.random().toString(), message: 'Your ride request expired because no drivers were available.', timestamp: new Date(), read: false }, ...state.notifications]
      }));
    });

    socket.on('driver_arrived', (data: any) => {
      const rideId = data.id || data._id;
      set((state) => ({
        activeRides: state.activeRides.map(r => (r.id === rideId || (r as any)._id === rideId) ? { ...r, ...data, status: 'ARRIVED' } : r)
      }));
      toast.success('Your driver has arrived!', { icon: '📍' });

      const msg = `Your driver ${data.driver?.name || 'Assigned'} has arrived at the pickup location.`;
      set((state) => ({
        notifications: [{ id: Math.random().toString(), message: msg, timestamp: new Date(), read: false }, ...state.notifications]
      }));
    });

    socket.on('ride_started', (data: any) => {
      const rideId = data.id || data._id;
      set((state) => ({
        activeRides: state.activeRides.map(r => (r.id === rideId || (r as any)._id === rideId) ? { ...r, ...data, status: 'IN_PROGRESS' } : r)
      }));
      toast.success('Your trip has started!', { icon: '🚀' });

      const msg = `Your ride with ${data.driver?.name || 'Assigned'} has started.`;
      set((state) => ({
        notifications: [{ id: Math.random().toString(), message: msg, timestamp: new Date(), read: false }, ...state.notifications]
      }));
    });

    socket.on('ride_completed', (data: any) => {
      const rideId = data.id || data._id;
      set((state) => ({
        activeRides: state.activeRides.map(r => (r.id === rideId || (r as any)._id === rideId) ? { ...r, ...data, status: 'COMPLETED' } : r)
      }));
      toast.success('Ride completed! You arrived at your destination.', { icon: '🏁' });

      const msg = `You have completed your ride. Thank you for riding!`;
      set((state) => ({
        notifications: [{ id: Math.random().toString(), message: msg, timestamp: new Date(), read: false }, ...state.notifications]
      }));
    });

    socket.on('ride_cancelled', (data: { rideId: string }) => {
      set((state) => ({ 
        incomingRides: state.incomingRides.filter(r => r.id !== data.rideId),
        activeRides: state.activeRides.filter(r => r.id !== data.rideId)
      }));
      toast.error('A ride was cancelled.');

      const msg = `Ride request was cancelled.`;
      set((state) => ({
        notifications: [{ id: Math.random().toString(), message: msg, timestamp: new Date(), read: false }, ...state.notifications]
      }));
    });

    socket.on('in_app_notification', (data: { message: string }) => {
      set((state) => ({
        notifications: [
          {
            id: Math.random().toString(),
            message: data.message,
            timestamp: new Date(),
            read: false
          },
          ...state.notifications
        ]
      }));
      toast.success(data.message, { icon: '🔔' });
    });

    socket.on('restore_active_rides', (rides: Ride[]) => {
      set({ activeRides: rides });
    });

    socket.on('initial_pending_rides', (rides: Ride[]) => {
      set({ incomingRides: rides });
    });

    socket.on('initial_driver_stats', (stats: DriverStats) => {
      set({ driverStats: stats });
    });

    socket.on('refresh_stats_trigger', () => {
      socket.emit('refresh_driver_stats');
    });

    socket.on('all_driver_locations', (locations: Record<string, { lat: number, lng: number, name?: string, phone?: string }>) => {
      set({ driverLocations: locations });
    });
  },
  
  disconnect: () => {
    socket.disconnect();
    set({ isConnected: false, onlineDrivers: {}, incomingRides: [], activeRides: [], driverStats: null, driverLocations: {}, notifications: [] });
  }
}));

