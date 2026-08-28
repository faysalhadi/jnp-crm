import React from "react";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import ContactModal from "../../ContactModal";

export default function ContactModalWrapper() {
  const {
    showContactModal, setShowContactModal,
    contactModalPreType, setContactModalPreType,
    setActiveCustomerId, setActiveDealId,
    loadCustomers, setView, setCustomers,
  } = useCustomers();
  const { setActiveTab } = useUI();

  if (!showContactModal) return null;

  return (
    <ContactModal
      defaultType={contactModalPreType}
      onClose={async () => {
        await loadCustomers();
        setShowContactModal(false);
        setContactModalPreType(null);
      }}
      onCreated={async (customer, deal) => {
        setShowContactModal(false);
        setContactModalPreType(null);
        if (customer) {
          // Seed the new row into local state before navigating. The chat view
          // resolves the customer by id out of this array, so waiting on the
          // refetch is what left it blank right after saving.
          setCustomers(prev => prev.some(c => c.id === customer.id)
            ? prev
            : [{ ...customer, deals: deal ? [deal] : [] }, ...prev]);
          setActiveCustomerId(customer.id);
          setActiveDealId(deal?.id || null);
          setView("detail");
          setActiveTab("customers");
        }
        await loadCustomers();
      }}
    />
  );
}
