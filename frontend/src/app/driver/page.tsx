'use client';
import { useAuthStore } from '@/store/authStore';
import { useSocketStore } from '@/store/socketStore';
import { socket } from '@/lib/socket';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Car, Power, PowerOff, MapPin, CheckCircle, Navigation, Loader2, Sparkles, Star, TrendingUp, History, IndianRupee, Activity } from 'lucide-react';
import MapWrapper from '@/components/MapWrapper';
import L from 'leaflet';

export default function DriverDashboard() {
  const { user, token, logout, isAuthenticated } = useAuthStore();
  const { connect, disconnect, isConnected, incomingRides, activeRides, driverStats, addActiveRide, removeActiveRide, driverLocations } = useSocketStore();
  const router = useRouter();
  
  const [isOnline, setIsOnline] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectedRides, setRejectedRides] = useState<string[]>([]);

  useEffect(() => {
    if (!isAuthenticated) router.push('/login');
    else if (token) connect(token);
    return () => disconnect();
  }, [isAuthenticated, router, token, connect, disconnect]);

  const toggleOnlineStatus = () => {
    if (isOnline) {
      socket.emit('driver_go_offline', (res: any) => {
        if (res && res.success) setIsOnline(false);
      });
    } else {
      socket.emit('driver_go_online', (res: any) => {
        if (res && res.success) setIsOnline(true);
      });
    }
  };

  const handleAcceptRide = (rideId: string) => {
    setAcceptingId(rideId);
    socket.emit('accept_ride', { rideId }, (res: any) => {
      if (res && res.success) {
        addActiveRide(res.ride); // Fix: Add ride to local driver state immediately!
      } else {
        alert(res?.error || 'Failed to accept ride. It may have been taken by someone else.');
      }
      setAcceptingId(null);
    });
  };

  const handleCompleteRide = (rideId: string) => {
    socket.emit('complete_ride', { rideId }, (res: any) => {
      if (res && res.success) {
        removeActiveRide(rideId);
      } else {
        alert(res?.error || 'Failed to complete ride.');
      }
    });
  };

  const handleRejectRide = (rideId: string) => {
    setRejectedRides(prev => [...prev, rideId]);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white relative overflow-hidden font-sans pb-12">
      {/* Premium Dark Mode Dynamic Background */}
      <div className="absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-emerald-600/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-teal-600/20 blur-[150px] rounded-full pointer-events-none"></div>

      <div className="max-w-6xl mx-auto p-4 sm:p-8 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-10 bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10 shadow-2xl">
          <div className="flex items-center gap-4 mb-4 sm:mb-0">
            <div className="bg-gradient-to-br from-emerald-400 to-teal-500 p-3 rounded-2xl shadow-[0_0_20px_rgba(52,211,153,0.3)]">
              <Car className="w-8 h-8 text-white" />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-black tracking-tight text-white">Driver Portal</h1>
              <p className="text-sm text-emerald-200 mt-1 font-medium flex items-center justify-center sm:justify-start gap-1">
                <Sparkles className="w-3 h-3" /> {user.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {driverStats && (
              <div className="hidden md:flex gap-4 bg-black/20 px-4 py-2 rounded-2xl border border-white/5 text-sm">
                <div>
                  <p className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-wider">Total Rides</p>
                  <p className="font-black text-white">{driverStats.totalRides}</p>
                </div>
                <div className="w-px bg-white/10"></div>
                <div>
                  <p className="text-[10px] text-amber-400/70 font-bold uppercase tracking-wider">Avg Rating</p>
                  <p className="font-black text-white flex items-center gap-1">
                    {driverStats.averageRating.toFixed(1)} <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  </p>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-3 bg-black/20 px-5 py-2.5 rounded-full border border-white/5">
              <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'}`}></span>
              <span className="text-sm font-bold text-slate-300 hidden sm:block tracking-wide">{isConnected ? 'System Online' : 'Reconnecting...'}</span>
            </div>
            <button 
              onClick={() => { logout(); router.push('/login'); }}
              className="flex items-center text-rose-400 hover:text-rose-300 hover:bg-rose-400/10 px-4 py-2 rounded-full transition-all text-sm font-bold tracking-wide"
            >
              <LogOut className="w-4 h-4 mr-2" /> EXIT
            </button>
          </div>
        </div>

        {/* Active Rides Section */}
        {activeRides.length > 0 && (
          <div className="mb-12 animate-in fade-in zoom-in duration-500">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center tracking-wide">
              <span className="bg-emerald-500/20 p-2 rounded-xl mr-3 border border-emerald-500/30">
                <CheckCircle className="w-5 h-5 text-emerald-400" /> 
              </span>
              Ongoing Trips ({activeRides.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeRides.map(ride => (
                <div key={ride.id} className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 backdrop-blur-xl border border-emerald-500/30 p-8 rounded-[2rem] shadow-[0_0_30px_rgba(52,211,153,0.15)] flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px]"></div>
                  
                  <div className="flex items-center justify-between mb-8">
                    <div className={`${ride.scheduledAt ? 'bg-amber-500 shadow-[0_0_20px_rgba(251,191,36,0.5)]' : 'bg-emerald-500 shadow-[0_0_20px_rgba(52,211,153,0.5)]'} w-16 h-16 rounded-2xl flex items-center justify-center`}>
                      {ride.scheduledAt ? <Navigation className="w-8 h-8 text-white" /> : <CheckCircle className="w-8 h-8 text-white" />}
                    </div>
                    <div className={`${ride.scheduledAt ? 'bg-amber-500/20 border-amber-500/30' : 'bg-emerald-500/20 border-emerald-500/30'} border px-4 py-2 rounded-full flex flex-col items-end`}>
                      <span className={`${ride.scheduledAt ? 'text-amber-300' : 'text-emerald-300'} text-xs font-bold uppercase tracking-wider ${!ride.scheduledAt && 'animate-pulse'}`}>
                        {ride.scheduledAt ? `UPCOMING: ${new Date(ride.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : 'In Progress'}
                      </span>
                      {!ride.scheduledAt && (() => {
                        const myLoc = driverLocations[user.id];
                        const distanceMeters = myLoc && ride.pickupLat && ride.pickupLng 
                          ? L.latLng(myLoc.lat, myLoc.lng).distanceTo(L.latLng(ride.pickupLat, ride.pickupLng)) 
                          : null;
                        const distanceText = distanceMeters ? (distanceMeters > 1000 ? `${(distanceMeters/1000).toFixed(1)} km to pickup` : `${Math.round(distanceMeters)}m to pickup`) : '';
                        
                        return distanceText ? <span className="text-[10px] text-emerald-200 font-medium">{distanceText}</span> : null;
                      })()}
                    </div>
                  </div>
                  
                  <div className="bg-black/40 rounded-2xl p-6 mb-6 border border-white/5 flex-1 relative z-10">
                    <div className="mb-4 pb-4 border-b border-white/10">
                      <p className="text-[10px] text-emerald-400/70 uppercase font-bold tracking-[0.2em] mb-1">Pickup Point</p>
                      <p className="font-black text-white text-lg tracking-wide">{ride.pickupLocation}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-400/70 uppercase font-bold tracking-[0.2em] mb-1">Dropoff Point</p>
                      <p className="font-black text-white text-lg tracking-wide">{ride.dropLocation}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-4 relative z-10">
                    <a href={`tel:${ride.passenger?.phone}`} className="py-4 bg-white/5 border border-white/10 text-white rounded-xl font-bold hover:bg-white/10 transition-all text-sm flex items-center justify-center px-8 flex-1">
                      Call Client
                    </a>
                    <button onClick={() => handleCompleteRide(ride.id)} className="py-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:shadow-[0_0_30px_rgba(52,211,153,0.5)] text-sm flex-[2] transform hover:-translate-y-1">
                      Finish Trip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Power Button */}
          <div className="lg:col-span-4 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl flex flex-col items-center justify-center min-h-[300px]">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-8">Duty Status</h3>
            <button
              onClick={toggleOnlineStatus}
              className={`w-48 h-48 rounded-full flex flex-col items-center justify-center transition-all duration-500 transform hover:scale-105 active:scale-95 border-4 ${
                isOnline 
                  ? 'bg-gradient-to-br from-emerald-400 to-teal-500 border-emerald-300/50 shadow-[0_0_60px_rgba(52,211,153,0.6)]' 
                  : 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 shadow-2xl'
              }`}
            >
              <Power className={`w-14 h-14 mb-3 transition-colors ${isOnline ? 'text-white' : 'text-slate-500'}`} />
              <span className={`font-black text-2xl tracking-[0.2em] transition-colors ${isOnline ? 'text-white' : 'text-slate-500'}`}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </button>
            <p className={`mt-8 text-sm font-medium ${isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isOnline ? 'Receiving local dispatch pings' : 'Tap to start receiving rides'}
            </p>
          </div>

          {/* Right Column: Map & Incoming Requests */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            
            {/* Live Map Box */}
            <div className="w-full h-[350px] bg-slate-800/40 border border-white/10 rounded-[2rem] p-2 relative shadow-2xl overflow-hidden">
              <MapWrapper />
            </div>

            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-6 flex items-center tracking-wide">
                <Navigation className="w-5 h-5 mr-3 text-indigo-400" /> Incoming Dispatches
              </h2>
            
            {!isOnline ? (
              <div className="bg-black/20 border border-dashed border-white/10 rounded-[2rem] p-12 text-center text-slate-400 h-[300px] flex flex-col items-center justify-center">
                <PowerOff className="w-12 h-12 mb-4 text-slate-600" />
                <p className="text-lg font-medium">You are offline.</p>
                <p className="text-sm mt-2 text-slate-500">Go online to connect with passengers.</p>
              </div>
            ) : incomingRides.filter(r => !rejectedRides.includes(r.id)).length === 0 ? (
              <div className="bg-indigo-900/10 border border-dashed border-indigo-500/30 rounded-[2rem] p-12 text-center h-[300px] flex flex-col items-center justify-center relative overflow-hidden">
                <div className="relative w-20 h-20 mb-6 mx-auto">
                  <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-20"></div>
                  <div className="relative bg-indigo-500/20 w-20 h-20 rounded-full flex items-center justify-center border border-indigo-500/30">
                    <Navigation className="w-8 h-8 text-indigo-400" />
                  </div>
                </div>
                <p className="text-lg font-bold text-indigo-200 tracking-wide">Radar Active</p>
                <p className="text-sm mt-2 text-indigo-300/50">Scanning area for new passenger requests...</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {incomingRides.filter(r => !rejectedRides.includes(r.id)).map((ride) => (
                  <div key={ride.id} className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/10 flex flex-col md:flex-row items-center justify-between animate-in slide-in-from-right-8 duration-300 gap-6 group hover:bg-white/15 transition-all">
                    <div className="flex-1 w-full">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="mt-1 bg-emerald-500/20 p-2 rounded-full border border-emerald-500/30"><MapPin className="w-4 h-4 text-emerald-400" /></div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-1">Pickup Location</p>
                          <p className="font-black text-white text-lg tracking-wide">{ride.pickupLocation}</p>
                        </div>
                      </div>
                      
                      {ride.status === 'SCHEDULED' && ride.scheduledAt ? (
                        <div className="flex items-start gap-4 mb-4">
                          <div className="mt-1 bg-amber-500/20 p-2 rounded-full border border-amber-500/30"><Navigation className="w-4 h-4 text-amber-400" /></div>
                          <div>
                            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-[0.2em] mb-1">Scheduled For</p>
                            <p className="font-black text-amber-300 text-lg tracking-wide">{new Date(ride.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-4">
                          <div className="mt-1 bg-rose-500/20 p-2 rounded-full border border-rose-500/30"><MapPin className="w-4 h-4 text-rose-400" /></div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-1">Dropoff Location</p>
                            <p className="font-black text-white text-lg tracking-wide">{ride.dropLocation}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 w-full md:w-auto min-w-[160px]">
                      <button 
                        onClick={() => handleAcceptRide(ride.id)}
                        disabled={acceptingId === ride.id}
                        className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white px-8 py-4 rounded-xl font-black tracking-widest hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all disabled:opacity-50 flex justify-center transform hover:-translate-y-1"
                      >
                        {acceptingId === ride.id ? <Loader2 className="w-6 h-6 animate-spin" /> : 'ACCEPT RIDE'}
                      </button>
                      <button 
                        onClick={() => handleRejectRide(ride.id)}
                        disabled={acceptingId === ride.id}
                        className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-8 py-3 rounded-xl font-bold tracking-widest transition-all text-sm"
                      >
                        REJECT
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Analytics Section */}
        {driverStats && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-12">
              <h2 className="text-2xl font-black text-white mb-6 flex items-center tracking-wide">
                <Activity className="w-6 h-6 mr-3 text-emerald-400" /> Driver Analytics & History
              </h2>
            </div>
            
            {/* Summary Cards */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="bg-gradient-to-br from-indigo-500/20 to-purple-600/20 backdrop-blur-xl border border-indigo-500/30 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">
                <div className="absolute right-[-20%] top-[-20%] w-32 h-32 bg-indigo-500/20 rounded-full blur-[40px]"></div>
                <div className="bg-indigo-500/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-indigo-300" />
                </div>
                <p className="text-xs text-indigo-300 uppercase font-bold tracking-[0.2em] mb-1">Total Completed Rides</p>
                <p className="text-5xl font-black text-white">{driverStats.totalRides}</p>
              </div>

              <div className="bg-gradient-to-br from-amber-500/20 to-orange-600/20 backdrop-blur-xl border border-amber-500/30 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">
                <div className="absolute right-[-20%] top-[-20%] w-32 h-32 bg-amber-500/20 rounded-full blur-[40px]"></div>
                <div className="bg-amber-500/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <Star className="w-6 h-6 text-amber-300" />
                </div>
                <p className="text-xs text-amber-300 uppercase font-bold tracking-[0.2em] mb-1">Average Rating</p>
                <p className="text-5xl font-black text-white flex items-center gap-2">
                  {driverStats.averageRating.toFixed(1)} <span className="text-xl text-amber-400/50">/ 5.0</span>
                </p>
              </div>

              <div className="bg-gradient-to-br from-emerald-500/20 to-teal-600/20 backdrop-blur-xl border border-emerald-500/30 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden">
                <div className="absolute right-[-20%] top-[-20%] w-32 h-32 bg-emerald-500/20 rounded-full blur-[40px]"></div>
                <div className="bg-emerald-500/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                  <IndianRupee className="w-6 h-6 text-emerald-300" />
                </div>
                <p className="text-xs text-emerald-300 uppercase font-bold tracking-[0.2em] mb-1">Total Lifetime Earnings</p>
                <p className="text-5xl font-black text-white flex items-center">
                  ₹{driverStats.totalEarnings || 0}
                </p>
              </div>
            </div>

            {/* Ride History Table */}
            <div className="lg:col-span-8 bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
                <h3 className="text-xl font-bold text-white flex items-center">
                  <History className="w-5 h-5 mr-3 text-slate-400" /> Recent Activity
                </h3>
              </div>

              {(!driverStats.rideHistory || driverStats.rideHistory.length === 0) ? (
                <div className="text-center py-12 text-slate-500">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No completed rides yet. Go online to start earning!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Date & Time</th>
                        <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Route</th>
                        <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Passenger</th>
                        <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Fare</th>
                        <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {driverStats.rideHistory.map((ride: any) => (
                        <tr key={ride.id} className="hover:bg-white/5 transition-colors group">
                          <td className="py-5 text-sm text-slate-300">
                            {new Date(ride.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-5">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold text-emerald-400">{ride.pickupLocation}</span>
                              <span className="text-xs text-slate-500">&darr;</span>
                              <span className="text-xs font-bold text-rose-400">{ride.dropLocation}</span>
                            </div>
                          </td>
                          <td className="py-5 text-sm font-medium text-white">{ride.passenger?.name || 'Unknown'}</td>
                          <td className="py-5 text-sm font-bold text-emerald-300">₹{ride.fare || 150}</td>
                          <td className="py-5">
                            {ride.feedback ? (
                              <div className="flex items-center gap-1 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 inline-flex">
                                <span className="text-amber-400 font-bold text-xs">{ride.feedback.rating}</span>
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                              </div>
                            ) : (
                              <span className="text-xs text-slate-600 italic">No rating</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
