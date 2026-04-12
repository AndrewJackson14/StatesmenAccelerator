import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [age, setAge] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setLocation(profile.location ?? '');
    setAge(profile.age?.toString() ?? '');
    setPhone(profile.phone ?? '');
    setBio(profile.bio ?? '');
  }, [profile]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        name: name || null,
        location: location || null,
        age: age ? Number(age) : null,
        phone: phone || null,
        bio: bio || null,
      })
      .eq('id', user.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await refreshProfile();
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Profile</h1>
        <p className="mt-1 text-sm text-slate-400">{user?.email}</p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Age</label>
            <input
              className="input"
              type="number"
              min={16}
              max={99}
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Location</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Bio</label>
          <textarea
            className="input min-h-[100px]"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        {saved && <div className="text-sm text-emerald-400">Saved.</div>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
