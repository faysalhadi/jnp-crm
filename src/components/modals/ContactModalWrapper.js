import React from "react";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import ContactModal from "../../ContactModal";

export default function ContactModalWrapper() {
  const {
    showContactModal, setShowContactModal,
    contactModalPreType, setContactModalPreType,
    setActiveCustomerId, setActiveDealId,
    loadCustomers, setView,
  } = useCustomers();
  const { setActiveTab } = useUI();

  if (!showContactModal) return null;

  return (
    <ContactModal
      defaultType={contactModalPreType}
      onClose={() => {
        setShowContactModal(false);
        setContactModalPreType(null);
      }}
      onCreated={async (customer, deal) => {
        await loadCustomers();
        setShowContactModal(false);
        setContactModalPreType(null);
        if (customer) {
          setActiveCustomerId(customer.id);
          setActiveDealId(deal?.id || null);
          setView("detail");
          setActiveTab("customers");
        }
      }}
    />
  );
}
