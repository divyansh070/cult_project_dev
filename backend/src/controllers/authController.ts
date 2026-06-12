import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Ride from '../models/Ride';
import Feedback from '../models/Feedback';
import { AuthRequest } from '../middleware/authMiddleware';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, role, phone, vehicle, willingToGoOutside } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      res.status(400).json({ error: 'Please enter a valid 10-digit Indian phone number' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      role,
      phone,
      willingToGoOutside: willingToGoOutside === true || willingToGoOutside === 'true',
      ...(role === 'DRIVER' && vehicle ? { vehicle } : {})
    });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }
    
    if (!user.password) {
      res.status(400).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userObj = user.toObject();
    delete userObj.password;
    res.json(userObj);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDriversOutside = async (req: Request, res: Response): Promise<void> => {
  try {
    // In Mongoose, we can aggregate to calculate driver ratings, or fetch and map.
    // Given the small scale, we will fetch and map.
    const drivers = await User.find({ role: 'DRIVER', willingToGoOutside: true });
    
    const driverIds = drivers.map(d => d._id);
    const completedRides = await Ride.find({ driverId: { $in: driverIds }, status: 'COMPLETED' })
      .populate('feedback'); // Need a virtual or direct query for feedback. Wait, feedback stores rideId.

    // Let's manually fetch feedbacks for these rides to calculate rating
    const mongoose = require('mongoose');
    const Feedback = mongoose.models.Feedback || mongoose.model('Feedback');
    
    const driversWithRatings = await Promise.all(drivers.map(async (d) => {
      const driverRides = completedRides.filter(r => r.driverId?.toString() === d.id);
      const rideIds = driverRides.map(r => r._id);
      const feedbacks = await Feedback.find({ rideId: { $in: rideIds } });
      
      const ratings = feedbacks.map((f: any) => f.rating);
      const avg = ratings.length > 0 ? ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length : 0;
      
      return {
        name: d.name,
        phone: d.phone,
        rating: avg
      };
    }));

    res.json(driversWithRatings.sort((a, b) => b.rating - a.rating).slice(0, 5));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPassengerHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const history = await Ride.find({
      passengerId: req.user.id,
      status: { $in: ['COMPLETED', 'CANCELLED'] }
    })
      .sort({ requestedAt: -1 })
      .populate('driver', 'name phone');

    // We also need feedback for each ride. Let's do an aggregate or manual mapping.
    const historyIds = history.map(h => h._id);
    const feedbacks = await Feedback.find({ rideId: { $in: historyIds } });

    const result = history.map(h => {
      const fb = feedbacks.find((f: any) => f.rideId.toString() === h._id.toString());
      const hObj = h.toObject();
      return {
        ...hObj,
        id: h._id.toString(),
        feedback: fb ? { rating: fb.rating, comment: fb.comment } : null
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
