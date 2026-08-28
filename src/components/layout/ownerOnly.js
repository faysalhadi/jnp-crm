import React from "react";
import { useProfile } from "../../context/ProfileContext";

// Second layer behind nav filtering: an owner-only tab refuses to render for
// anyone else, so a stale activeTab value or a stray setActiveTab call cannot
// put a salesperson inside it.
//
// This is a wrapper rather than an early return inside each component because
// an early return placed before the component's own hooks would break the
// rules of hooks, and placing it after them means the component still does all
// its work (and its queries) before bailing out.
export default function ownerOnly(Component) {
  function OwnerOnlyTab(props) {
    const { isOwner, isViewingAs } = useProfile();
    if (!isOwner || isViewingAs) return null;
    return <Component {...props} />;
  }
  OwnerOnlyTab.displayName = `ownerOnly(${Component.displayName || Component.name || "Component"})`;
  return OwnerOnlyTab;
}
