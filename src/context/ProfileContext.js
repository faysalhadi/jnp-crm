import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, signupSupabase } from '../supabase';
import { useAuth } from './AuthContext';

const ProfileContext = createContext();

export function ProfileProvider({ children }) {
  const { user } = useAuth();
  const [currentProfile, setCurrentProfile] = useState(null);
  const [profiles, setProfiles] = useState([]); // all profiles — owner only
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [viewingAs, setViewingAsState] = useState(null);

  useEffect(() => {
    if (!user) {
      setCurrentProfile(null);
      setProfileLoading(false);
      return;
    }
    fetchCurrentProfile();
  }, [user]); // eslint-disable-line

  async function fetchCurrentProfile() {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      setProfileError('Account not set up. Contact Faisal to configure your profile.');
      setProfileLoading(false);
      return;
    }

    setCurrentProfile(data);
    setProfileError(null);

    if (data.role === 'owner') {
      fetchAllProfiles();
    }
    setProfileLoading(false);
  }

  async function fetchAllProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('name');
    setProfiles(data || []);
  }

  // Create a salesperson account (owner only)
  async function createSalesperson({ name, email, password, whatsapp_number }) {
    // Create auth user using isolated client (doesn't affect Faisal's session)
    const { data: signUpData, error: signUpError } = await signupSupabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) throw new Error(signUpError.message);
    if (!signUpData?.user?.id) throw new Error('User creation failed — check email confirmation is disabled in Supabase Auth settings');

    // Insert profile
    const { error: profError } = await supabase.from('profiles').insert({
      id: signUpData.user.id,
      name,
      role: 'salesperson',
      whatsapp_number: whatsapp_number || null,
    });

    if (profError) throw new Error(profError.message);

    await fetchAllProfiles();
  }

  // Delete a salesperson (owner only)
  async function deleteSalesperson(profileId) {
    const { error } = await supabase.from('profiles').delete().eq('id', profileId);
    if (error) throw new Error(error.message);
    // Also unassign their clients
    await supabase.from('customers').update({ assigned_to: null }).eq('assigned_to', profileId);
    await fetchAllProfiles();
  }

  // Assign a customer to a salesperson (or null to unassign)
  async function assignClient(customerId, profileId) {
    const { error } = await supabase
      .from('customers')
      .update({ assigned_to: profileId })
      .eq('id', customerId);
    if (error) throw new Error(error.message);
  }

  const isOwner = currentProfile?.role === 'owner';
  const isSalesperson = currentProfile?.role === 'salesperson';

  // WhatsApp number for the current user — falls back to Faisal's if not set
  const myWhatsApp = currentProfile?.whatsapp_number || '+971509423162';

  function setViewingAs(profile) { setViewingAsState(profile); }
  function clearViewingAs() { setViewingAsState(null); }

  const isViewingAs = viewingAs !== null;
  const effectiveId = viewingAs ? viewingAs.id : currentProfile?.id;
  const showCostFields = isOwner && !isViewingAs;

  return (
    <ProfileContext.Provider value={{
      currentProfile,
      profiles,
      profileLoading,
      profileError,
      isOwner,
      isSalesperson,
      myWhatsApp,
      viewingAs,
      isViewingAs,
      effectiveId,
      showCostFields,
      createSalesperson,
      deleteSalesperson,
      assignClient,
      fetchAllProfiles,
      setViewingAs,
      clearViewingAs,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export const useProfile = () => useContext(ProfileContext);
