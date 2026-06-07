import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import fs from 'fs';

export interface ConnectedUser {
  socketId: string;
  userId: string;
  role: string;
}

export const connectedUsers = new Map<string, ConnectedUser>();
const onlineDrivers = new Map<string, boolean>();
const driverLocations = new Map<string, { lat: number, lng: number }>();
const IITR_CENTER = { lat: 29.8649, lng: 77.8966 };

export function initializeSockets(io: Server) {
  setInterval(() => {
    if (onlineDrivers.size > 0) {
      const locations: Record<string, { lat: number, lng: number }> = {};
      for (const driverId of onlineDrivers.keys()) {
        let loc = driverLocations.get(driverId);
        if (!loc) {
          loc = {
            lat: IITR_CENTER.lat + (Math.random() - 0.5) * 0.01,
            lng: IITR_CENTER.lng + (Math.random() - 0.5) * 0.01
          };
        } else {
          loc.lat += (Math.random() - 0.5) * 0.0005;
          loc.lng += (Math.random() - 0.5) * 0.0005;
        }
        driverLocations.set(driverId, loc);
        locations[driverId] = loc;
      }
      io.emit('all_driver_locations', locations);
    }
  }, 1000);

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    jwt.verify(token, process.env.JWT_SECRET || 'secret123', (err: any, decoded: any) => {
      if (err) return next(new Error('Authentication error'));
      socket.data.user = decoded;
      next();
    });
  });

  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user;
    
    connectedUsers.set(socket.id, {
      socketId: socket.id,
      userId: user.id,
      role: user.role
    });

    console.log(`User connected via Socket.IO: ${user.id} (${user.role})`);

    const onlineDriversList = await prisma.user.findMany({
      where: { role: 'DRIVER', isOnline: true },
      select: { id: true }
    });
    socket.emit('initial_drivers_state', onlineDriversList.map(d => d.id));

    let activeRides: any[] = [];
    if (user.role === 'PASSENGER') {
      activeRides = await prisma.ride.findMany({
        where: { passengerId: user.id, status: { in: ['REQUESTED', 'SCHEDULED', 'ACCEPTED', 'IN_PROGRESS'] } },
        include: { driver: { select: { name: true, phone: true } } }
      });
    } else if (user.role === 'DRIVER') {
      const stats = await prisma.ride.aggregate({
        where: { driverId: user.id, status: 'COMPLETED' },
        _count: { id: true }
      });
      const feedbacks = await prisma.feedback.findMany({
        where: { ride: { driverId: user.id } },
        select: { rating: true }
      });
      const avgRating = feedbacks.length > 0 
        ? feedbacks.reduce((acc, curr) => acc + curr.rating, 0) / feedbacks.length 
        : 0;
        
      // Fetch History and Earnings
      const rideHistory = await prisma.ride.findMany({
        where: { driverId: user.id, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 10,
        include: { passenger: { select: { name: true } }, feedback: { select: { rating: true, comment: true } } }
      });
      
      const totalEarnings = rideHistory.reduce((acc, curr) => acc + (curr.fare || 0), 0);

      socket.emit('initial_driver_stats', { 
        totalRides: stats._count.id, 
        averageRating: avgRating,
        totalEarnings,
        rideHistory
      });

      activeRides = await prisma.ride.findMany({
        where: { driverId: user.id, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
        include: { passenger: { select: { name: true, phone: true } } }
      });
    }
    if (activeRides.length > 0) {
      socket.emit('restore_active_rides', activeRides);
    }

    if (user.role === 'DRIVER') {
      const driver = await prisma.user.findUnique({ where: { id: user.id } });
      if (driver?.isOnline) {
        onlineDrivers.set(user.id, true);
        socket.join('online_drivers');
        io.emit('driver_status_change', { driverId: user.id, isOnline: true });
      }
    } else {
      socket.join('passengers');
    }

    socket.on('driver_go_online', async (data, callback) => {
      let payload = data;
      let cb = callback;
      if (typeof data === 'function') {
        cb = data;
        payload = {};
      }

      fs.appendFileSync('socket-debug.log', `--- RECEIVED driver_go_online from ${user.id} ---\n`);
      if (user.role !== 'DRIVER') return;
      try {
        fs.appendFileSync('socket-debug.log', `Updating DB...\n`);
        await prisma.user.update({ where: { id: user.id }, data: { isOnline: true } });
        onlineDrivers.set(user.id, true);
        
        if (payload && payload.lat && payload.lng) {
          driverLocations.set(user.id, { lat: payload.lat, lng: payload.lng });
        } else {
          driverLocations.set(user.id, {
            lat: IITR_CENTER.lat + (Math.random() - 0.5) * 0.01,
            lng: IITR_CENTER.lng + (Math.random() - 0.5) * 0.01
          });
        }

        fs.appendFileSync('socket-debug.log', `Joining room...\n`);
        socket.join('online_drivers');
        fs.appendFileSync('socket-debug.log', `Emitting status...\n`);
        io.emit('driver_status_change', { driverId: user.id, isOnline: true });
        
        const pendingRides = await prisma.ride.findMany({
          where: { status: { in: ['REQUESTED', 'SCHEDULED'] } },
          include: { passenger: { select: { name: true, phone: true } } }
        });
        socket.emit('initial_pending_rides', pendingRides);
        
        fs.appendFileSync('socket-debug.log', `Firing callback...\n`);
        if (typeof cb === 'function') cb({ success: true });
      } catch (err: any) {
        fs.appendFileSync('socket-debug.log', `Error: ${err.message}\n`);
        if (typeof cb === 'function') cb({ success: false, error: err.message });
      }
    });

    socket.on('driver_go_offline', async (callback) => {
      if (user.role !== 'DRIVER') return;
      try {
        await prisma.user.update({ where: { id: user.id }, data: { isOnline: false } });
        onlineDrivers.delete(user.id);
        driverLocations.delete(user.id);
        socket.leave('online_drivers');
        io.emit('driver_status_change', { driverId: user.id, isOnline: false });
        if (callback) callback({ success: true });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${user.id}`);
      connectedUsers.delete(socket.id);
      
      if (user.role === 'DRIVER') {
        try {
          await prisma.user.update({ where: { id: user.id }, data: { isOnline: false } });
          onlineDrivers.delete(user.id);
          driverLocations.delete(user.id);
          io.emit('driver_status_change', { driverId: user.id, isOnline: false });
        } catch (e) {}
      }
    });

    socket.on('request_ride', async (data, callback) => {
      if (user.role !== 'PASSENGER') return;
      try {
        const { pickupLocation, pickupLat, pickupLng, dropoffLocation, dropoffLat, dropoffLng, scheduledAt } = data;
        
        if (scheduledAt) {
          const scheduledTime = new Date(scheduledAt).getTime();
          const now = new Date().getTime();
          if (scheduledTime < now) {
            if (typeof callback === 'function') callback({ success: false, error: 'Cannot schedule a ride in the past.' });
            return;
          }
        }
        
        const status = scheduledAt ? 'SCHEDULED' : 'REQUESTED';

        // Calculate Fare: Distance in km * 10 (minimum ₹20)
        let calculatedFare = 50; // default fallback
        if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
          const R = 6371e3;
          const p1 = pickupLat * Math.PI / 180;
          const p2 = dropoffLat * Math.PI / 180;
          const dp = (dropoffLat - pickupLat) * Math.PI / 180;
          const dl = (dropoffLng - pickupLng) * Math.PI / 180;
          const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distanceMeters = R * c;
          calculatedFare = Math.max(20, Math.round((distanceMeters / 1000) * 10));
        }

        const ride = await prisma.ride.create({
          data: {
            passengerId: user.id,
            pickupLocation,
            pickupLat,
            pickupLng,
            dropLocation: dropoffLocation,
            dropLat: dropoffLat,
            dropLng: dropoffLng,
            fare: calculatedFare,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            status
          },
          include: { passenger: { select: { name: true, phone: true } } }
        });

        // Broadcast to all online drivers
        io.to('online_drivers').emit('new_ride_request', ride);
        
        if (typeof callback === 'function') callback({ success: true, ride });
      } catch (err: any) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Driver Acceptance Logic
    socket.on('accept_ride', async (data, callback) => {
      if (user.role !== 'DRIVER') return;
      try {
        const { rideId } = data;
        
        const ride = await prisma.ride.findFirst({
          where: { id: rideId, status: 'REQUESTED' }
        });

        if (!ride) {
          if (typeof callback === 'function') callback({ success: false, error: 'Ride is no longer available or already accepted.' });
          return;
        }

        const updatedRide = await prisma.ride.update({
          where: { id: rideId },
          data: {
            driverId: user.id,
            status: 'ACCEPTED'
          },
          include: { driver: { select: { name: true, phone: true } } }
        });

        // Notify the specific passenger
        const passengerSocket = [...connectedUsers.values()].find(u => u.userId === updatedRide.passengerId);
        if (passengerSocket) {
          io.to(passengerSocket.socketId).emit('ride_accepted', updatedRide);
        }

        // Notify all other drivers to remove it from their dashboards
        io.to('online_drivers').emit('ride_removed', { rideId });

        if (typeof callback === 'function') callback({ success: true, ride: updatedRide });
      } catch (err: any) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Driver Completion Logic
    socket.on('complete_ride', async (data, callback) => {
      if (user.role !== 'DRIVER') return;
      try {
        const { rideId } = data;
        
        const updatedRide = await prisma.ride.update({
          where: { id: rideId, driverId: user.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
          include: { driver: { select: { name: true, phone: true } } }
        });

        const passengerSocket = [...connectedUsers.values()].find(u => u.userId === updatedRide.passengerId);
        if (passengerSocket) {
          io.to(passengerSocket.socketId).emit('ride_completed', updatedRide);
        }

        if (typeof callback === 'function') callback({ success: true, ride: updatedRide });
      } catch (err: any) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Cancel Ride
    socket.on('cancel_ride', async (data, callback) => {
      if (user.role !== 'PASSENGER') return;
      try {
        const { rideId } = data;
        const ride = await prisma.ride.update({
          where: { id: rideId, passengerId: user.id },
          data: { status: 'CANCELLED' }
        });
        io.to('online_drivers').emit('ride_removed', { rideId });
        socket.emit('ride_cancelled', { rideId });
        if (typeof callback === 'function') callback({ success: true });
      } catch (err: any) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Submit Feedback
    socket.on('submit_feedback', async (data, callback) => {
      if (user.role !== 'PASSENGER') return;
      try {
        const { rideId, rating, comment } = data;
        const feedback = await prisma.feedback.create({
          data: {
            rideId,
            passengerId: user.id,
            rating,
            comment
          }
        });
        if (typeof callback === 'function') callback({ success: true, feedback });
      } catch (err: any) {
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });
  });
}
