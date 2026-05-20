import React, { createContext, useContext, useState, useCallback } from "react";
import { supabase } from "../supabase";

const ReservationsContext = createContext(null);

export function ReservationsProvider({ children }) {
  const [reservedDeals, setReservedDeals] = useState([]);
  const [reservedDealsLoading, setReservedDealsLoading] = useState(false);
  const [expandedReservedDeal, setExpandedReservedDeal] = useState(null);
  const [showCompleteReservation, setShowCompleteReservation] = useState(false);
  const [completingDeal, setCompletingDeal] = useState(null);
  const [completionPaymentMethod, setCompletionPaymentMethod] = useState("Cash");
  const [showEditReservation, setShowEditReservation] = useState(false);
  const [editReservationItem, setEditReservationItem] = useState(null);
  const [editReservationForm, setEditReservationForm] = useState({
    agreedPrice: "",
    pickupDate: "",
    depositAmount: "",
    balanceDue: "",
    notes: "",
  });
  const [showLinkStock, setShowLinkStock] = useState(false);
  const [linkStockDeal, setLinkStockDeal] = useState(null);
  const [showReservation, setShowReservation] = useState(false);

  const loadReservedDeals = useCallback(async () => {
    setReservedDealsLoading(true);
    const { data } = await supabase
      .from("deals")
      .select("*, customers(id, name, number), deal_items(*)")
      .eq("stage", "confirmed_pending_pickup")
      .order("created_at", { ascending: false });
    setReservedDeals(data || []);
    setReservedDealsLoading(false);
  }, []);

  return (
    <ReservationsContext.Provider value={{
      reservedDeals, setReservedDeals,
      reservedDealsLoading,
      expandedReservedDeal, setExpandedReservedDeal,
      showCompleteReservation, setShowCompleteReservation,
      completingDeal, setCompletingDeal,
      completionPaymentMethod, setCompletionPaymentMethod,
      showEditReservation, setShowEditReservation,
      editReservationItem, setEditReservationItem,
      editReservationForm, setEditReservationForm,
      showLinkStock, setShowLinkStock,
      linkStockDeal, setLinkStockDeal,
      showReservation, setShowReservation,
      loadReservedDeals,
    }}>
      {children}
    </ReservationsContext.Provider>
  );
}

export function useReservations() {
  const context = useContext(ReservationsContext);
  if (!context) throw new Error(
    "useReservations must be used within ReservationsProvider"
  );
  return context;
}
