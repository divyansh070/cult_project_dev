'use client';
import { useAuthStore } from '@/store/authStore';
import { useSocketStore } from '@/store/socketStore';
import { socket } from '@/lib/socket';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, MapPin, Navigation, Loader2, CheckCircle2, CarFront, Star, Sparkles } from 'lucide-react';
import MapWrapper from '@/components/MapWrapper';
import toast from 'react-hot-toast';
import L from 'leaflet';

export default function PassengerDashboard() {
  const { user, token, logout, isAuthenticated } = useAuthStore();
  const { connect, disconnect, isConnected, onlineDrivers, activeRides, addActiveRide, removeActiveRide, driverLocations } = useSocketStore();
  const router = useRouter();

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [minDateTime, setMinDateTime] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    } else if (token) {
      connect(token);
    }
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setMinDateTime(now.toISOString().slice(0, 16));
    
    return () => disconnect();
  }, [isAuthenticated, router, token, connect, disconnect]);

  if (!user) return null;

  const activeDriverCount = Object.keys(onlineDrivers).length;

  const geocodeAddress = async (address: string) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const handleRequestRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickup || !dropoff) return;
    
    if (isScheduled) {
      if (!scheduledDate) {
        setError('Please select a date and time for your scheduled ride.');
        return;
      }
      const selectedTime = new Date(scheduledDate).getTime();
      const now = new Date().getTime();
      if (selectedTime < now) {
        setError('Cannot schedule a ride in the past. Please select a future time.');
        return;
      }
    }
    
    setIsRequesting(true);
    setError('');

    toast.loading('Geocoding addresses...', { id: 'geocode' });
    const pickupCoords = await geocodeAddress(pickup);
    const dropoffCoords = await geocodeAddress(dropoff);
    
    if (!pickupCoords || !dropoffCoords) {
      toast.dismiss('geocode');
      setError('Could not locate these addresses on the map. Please try being more specific (e.g., add City name).');
      setIsRequesting(false);
      return;
    }
    toast.success('Addresses found!', { id: 'geocode' });
    
    socket.emit('request_ride', { 
      pickupLocation: pickup, 
      pickupLat: pickupCoords.lat,
      pickupLng: pickupCoords.lng,
      dropoffLocation: dropoff,
      dropoffLat: dropoffCoords.lat,
      dropoffLng: dropoffCoords.lng,
      scheduledAt: isScheduled ? scheduledDate : null 
    }, (res: any) => {
      if (res && res.success) {
        addActiveRide(res.ride);
        setPickup('');
        setDropoff('');
        setIsScheduled(false);
        setScheduledDate('');
      } else {
        setError(res?.error || 'Failed to request ride');
      }
      setIsRequesting(false);
    });
  };

  const handleCancelRide = (rideId: string) => {
    socket.emit('cancel_ride', { rideId }, (res: any) => {
      if (!res || !res.success) {
        alert(res?.error || 'Failed to cancel ride');
      }
    });
  };

  const handleSubmitFeedback = (rideId: string) => {
    const rating = ratings[rideId] || 5;
    socket.emit('submit_feedback', { rideId, rating, comment: '' }, (res: any) => {
      if (res && res.success) {
        removeActiveRide(rideId);
      } else {
        alert(res?.error || 'Failed to submit feedback');
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white relative overflow-hidden font-sans">
      {/* Premium Dark Mode Dynamic Background */}
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/20 blur-[150px] rounded-full pointer-events-none"></div>

      <div className="max-w-6xl mx-auto p-4 sm:p-8 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-10 bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10 shadow-2xl">
          <div className="text-center sm:text-left mb-4 sm:mb-0">
            <h1 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-sm">
              Cult Rides
            </h1>
            <p className="text-sm text-indigo-200 mt-1 flex items-center justify-center sm:justify-start gap-2 font-medium">
              <Sparkles className="w-4 h-4 text-purple-400" /> Welcome back, {user.name}
            </p>
          </div>
          <div className="flex items-center gap-6">
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
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Form & Stats */}
          <div className="lg:col-span-4 space-y-8">
            
            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              <h3 className="text-lg font-bold text-white mb-6 flex items-center tracking-wide">
                <Navigation className="w-5 h-5 mr-3 text-indigo-400" /> Live Status
              </h3>
              
              <div className="bg-black/30 rounded-3xl p-8 border border-white/5 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
                <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-300 to-purple-500 block mb-2 drop-shadow-lg">{activeDriverCount}</span>
                <p className="text-xs font-bold text-indigo-300/70 uppercase tracking-[0.2em]">Drivers Nearby</p>
                
                {activeDriverCount > 0 ? (
                  <div className="mt-6 inline-flex items-center text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
                    Ready to Book
                  </div>
                ) : (
                  <div className="mt-6 inline-flex items-center text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-full">
                    Searching area...
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 shadow-2xl relative">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center tracking-wide">
                <MapPin className="w-5 h-5 mr-3 text-indigo-400" /> Request a Ride
              </h3>
              {error && <div className="mb-6 p-4 bg-rose-500/10 text-rose-300 text-sm font-medium rounded-2xl border border-rose-500/20">{error}</div>}
              
              <form onSubmit={handleRequestRide} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-indigo-300/70 uppercase tracking-[0.15em] mb-2 pl-1">Pickup Location</label>
                  <input 
                    type="text" 
                    value={pickup}
                    onChange={(e) => setPickup(e.target.value)}
                    placeholder="Where are you?"
                    className="w-full px-5 py-4 bg-black/20 text-white rounded-2xl border border-white/10 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-white/20"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-300/70 uppercase tracking-[0.15em] mb-2 pl-1">Dropoff Location</label>
                  <input 
                    type="text" 
                    value={dropoff}
                    onChange={(e) => setDropoff(e.target.value)}
                    placeholder="Where to?"
                    className="w-full px-5 py-4 bg-black/20 text-white rounded-2xl border border-white/10 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-white/20"
                    required
                  />
                </div>
                
                <div className="flex items-center gap-3 pt-2 pb-2">
                  <input 
                    type="checkbox" 
                    id="scheduleToggle" 
                    checked={isScheduled} 
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/20 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                  />
                  <label htmlFor="scheduleToggle" className="text-sm font-medium text-indigo-200 cursor-pointer">
                    Schedule for later
                  </label>
                </div>

                {isScheduled && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <label className="block text-[10px] font-bold text-amber-300/70 uppercase tracking-[0.15em] mb-2 pl-1">Select Date & Time</label>
                    <input 
                      type="datetime-local" 
                      value={scheduledDate}
                      min={minDateTime}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full px-5 py-4 bg-amber-500/10 text-white rounded-2xl border border-amber-500/30 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                      required={isScheduled}
                    />
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isRequesting || (activeDriverCount === 0 && !isScheduled)}
                  className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-bold transition-all disabled:opacity-50 disabled:grayscale flex justify-center items-center mt-4 shadow-[0_0_30px_rgba(99,102,241,0.3)] hover:shadow-[0_0_40px_rgba(99,102,241,0.5)] transform hover:-translate-y-1 active:translate-y-0"
                >
                  {isRequesting ? <Loader2 className="w-6 h-6 animate-spin" /> : (isScheduled ? 'Schedule Ride' : 'Summon Driver')}
                </button>
              </form>
            </div>
          </div>
          
          {/* Right Column: Live Map & Active Rides */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">
            {/* Live Map Box */}
            <div className="w-full h-[400px] bg-slate-800/40 border border-white/10 rounded-[2rem] p-2 relative shadow-2xl overflow-hidden">
              <MapWrapper />
            </div>

            {activeRides.length === 0 ? (
              <div className="bg-white/5 backdrop-blur-xl p-12 rounded-[2rem] border border-white/10 border-dashed h-full flex flex-col justify-center items-center text-center text-white/40">
                <div className="bg-white/5 p-6 rounded-full mb-6">
                  <CarFront className="w-16 h-16 text-white/20" />
                </div>
                <p className="text-xl font-bold tracking-wide text-white/60 mb-2">The map is empty.</p>
                <p className="text-sm font-medium">Request a ride to get started.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {activeRides.map((ride) => (
                  <div key={ride.id} className="bg-white/10 backdrop-blur-2xl p-8 rounded-[2rem] border border-white/20 shadow-2xl flex flex-col md:flex-row gap-8 animate-in slide-in-from-bottom-8 duration-500 relative overflow-hidden group">
                    
                    {/* Glossy Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

                    {ride.status === 'SCHEDULED' ? (
                      <div className="flex-1 text-center py-8">
                        <div className="bg-gradient-to-br from-amber-400 to-orange-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(251,191,36,0.5)] border-2 border-white/20">
                          <CheckCircle2 className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Ride Scheduled!</h2>
                        <p className="text-sm font-bold text-amber-300/70 uppercase tracking-[0.2em] mb-4">
                          {new Date(ride.scheduledAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                        <p className="text-sm font-medium text-amber-100 mb-6 bg-amber-500/10 inline-block px-4 py-2 rounded-full border border-amber-500/20">
                          {ride.pickupLocation} <span className="mx-2 text-white/30">&rarr;</span> {ride.dropLocation}
                        </p>
                        <p className="text-xs text-white/40 mb-6">Waiting for a driver to accept it...</p>
                        <button 
                          onClick={() => handleCancelRide(ride.id)}
                          className="px-6 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-xl font-bold hover:bg-rose-500/20 transition-all text-sm"
                        >
                          Cancel Ride
                        </button>
                      </div>
                    ) : ride.status === 'REQUESTED' ? (
                      <div className="flex-1 text-center py-8">
                        <div className="relative w-24 h-24 mx-auto mb-8">
                          <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-30"></div>
                          <div className="relative bg-gradient-to-br from-indigo-500 to-purple-600 w-24 h-24 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.5)] z-10 border-2 border-white/20">
                            <Loader2 className="w-10 h-10 text-white animate-spin" />
                          </div>
                        </div>
                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Broadcasting...</h2>
                        <p className="text-sm font-medium text-indigo-200 mb-6 bg-black/20 inline-block px-4 py-2 rounded-full border border-white/5">
                          {ride.pickupLocation} <span className="mx-2 text-white/30">&rarr;</span> {ride.dropLocation}
                        </p>
                        <button 
                          onClick={() => handleCancelRide(ride.id)}
                          className="px-6 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-xl font-bold hover:bg-rose-500/20 transition-all text-sm"
                        >
                          Cancel Request
                        </button>
                      </div>
                    ) : ride.status === 'COMPLETED' ? (
                      <div className="flex-1 text-center py-6">
                        <div className="bg-gradient-to-br from-amber-400 to-orange-500 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(251,191,36,0.5)] border-2 border-white/20">
                          <Star className="w-10 h-10 text-white fill-white" />
                        </div>
                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Destination Reached</h2>
                        <p className="text-sm text-amber-100 mb-8 font-medium">Rate your experience with {ride.driver?.name}</p>
                        
                        <div className="bg-black/20 p-6 rounded-3xl border border-white/5 inline-block w-full max-w-sm backdrop-blur-md">
                          <div className="flex justify-center gap-3 mb-8">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button 
                                key={star} 
                                onClick={() => setRatings(prev => ({ ...prev, [ride.id]: star }))}
                                className={`transition-all hover:scale-125 transform ${ratings[ride.id] >= star ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]' : 'text-white/10 hover:text-white/30'}`}
                              >
                                <Star className={`w-10 h-10 ${ratings[ride.id] >= star ? 'fill-amber-400' : ''}`} />
                              </button>
                            ))}
                          </div>
                          <button 
                            onClick={() => handleSubmitFeedback(ride.id)}
                            className="w-full py-4 bg-white text-slate-900 rounded-xl font-black tracking-wide hover:bg-slate-200 transition-all shadow-lg transform hover:-translate-y-1"
                          >
                            Submit Feedback
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 py-4 flex flex-col md:flex-row items-center md:items-start gap-8">
                        <div className="bg-gradient-to-br from-emerald-400 to-teal-500 w-24 h-24 rounded-full flex flex-shrink-0 items-center justify-center shadow-[0_0_40px_rgba(52,211,153,0.5)] border-2 border-white/20">
                          <CheckCircle2 className="w-12 h-12 text-white" />
                        </div>
                        <div className="flex-1 text-center md:text-left w-full">
                          <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Driver Assigned!</h2>
                          
                          {(() => {
                            const driverLoc = driverLocations[ride.driverId];
                            const distanceMeters = driverLoc && ride.pickupLat && ride.pickupLng 
                              ? L.latLng(driverLoc.lat, driverLoc.lng).distanceTo(L.latLng(ride.pickupLat, ride.pickupLng)) 
                              : null;
                            const distanceText = distanceMeters ? (distanceMeters > 1000 ? `${(distanceMeters/1000).toFixed(1)} km away` : `${Math.round(distanceMeters)}m away`) : 'Locating...';
                            
                            return (
                              <p className="text-sm text-emerald-100 mb-6 font-medium bg-emerald-500/10 inline-block px-4 py-2 rounded-full border border-emerald-500/20">
                                En route to {ride.pickupLocation} • <span className="font-bold text-emerald-300">{distanceText}</span>
                              </p>
                            );
                          })()}
                          
                          <div className="bg-black/30 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 w-full relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
                            <div className="flex items-center gap-4">
                              <div className="bg-white/10 p-3 rounded-2xl border border-white/5">
                                <CarFront className="w-8 h-8 text-white" />
                              </div>
                              <div className="text-left">
                                <p className="text-[10px] text-emerald-300/70 uppercase tracking-[0.2em] font-bold mb-1">Your Driver</p>
                                <p className="font-black text-xl text-white tracking-wide">{ride.driver?.name}</p>
                              </div>
                            </div>
                            <a href={`tel:${ride.driver?.phone}`} className="w-full sm:w-auto px-8 py-3 bg-white text-slate-900 rounded-xl font-black tracking-wide hover:bg-slate-200 transition-all shadow-lg text-center transform hover:-translate-y-1">
                              Contact
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
