import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

const TABS = ['Overview', 'Activity', 'Clients', 'Deals'];

const STAGE_LABELS = {
  new_inquiry: 'New Inquiry',
  watching: 'Watching',
  device_found: 'Device Found',
  negotiation: 'Negotiation',
  confirmed_pending_pickup: 'Confirmed',
  closed: 'Closed',
  lost: 'Lost',
};

const STAGE_COLORS = {
  new_inquiry: '#7880A3',
  watching: '#8B5CF6',
  device_found: '#5190FF',
  negotiation: '#F0AC2A',
  confirmed_pending_pickup: '#2EC97A',
  closed: '#2EC97A',
  lost: '#F07070',
};

const ACTIVITY_LABELS = {
  called: '📞 Called',
  no_answer: '📵 No Answer',
  messaged: '💬 Messaged',
  met: '🤝 Met',
  note: '📝 Note',
};

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatAED(val) {
  if (!val) return '—';
  return 'AED ' + Number(val).toLocaleString();
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SalespersonDetailView({ salesperson, onClose }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);

  const [clients, setClients] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [followUps, setFollowUps] = useState([]);

  useEffect(() => {
    fetchAll();
  }, [salesperson.id]); // eslint-disable-line

  async function fetchAll() {
    setLoading(true);

    const { data: clientData } = await supabase
      .from('customers')
      .select('*')
      .eq('assigned_to', salesperson.id)
      .order('last_active', { ascending: false });

    const clientList = clientData || [];
    setClients(clientList);

    if (clientList.length === 0) {
      setDeals([]);
      setActivities([]);
      setFollowUps([]);
      setLoading(false);
      return;
    }

    const clientIds = clientList.map(c => c.id);

    const { data: dealData } = await supabase
      .from('deals')
      .select('*, customers(name, number)')
      .in('customer_id', clientIds)
      .order('created_at', { ascending: false });

    setDeals(dealData || []);

    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: actData } = await supabase
      .from('activity_log')
      .select('*, customers(name)')
      .in('customer_id', clientIds)
      .gte('logged_at', since)
      .order('logged_at', { ascending: false })
      .limit(100);

    setActivities(actData || []);

    const { data: fuData } = await supabase
      .from('follow_ups')
      .select('*, customers(name)')
      .in('customer_id', clientIds)
      .order('due_at', { ascending: true });

    setFollowUps(fuData || []);
    setLoading(false);
  }

  const openDeals = deals.filter(d => !['closed', 'lost'].includes(d.stage));
  const closedDeals = deals.filter(d => d.stage === 'closed');
  const thisMonth = new Date();
  thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
  const closedThisMonth = closedDeals.filter(d => d.closed_at && new Date(d.closed_at) >= thisMonth);
  const revenueThisMonth = closedThisMonth.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const overdueFollowUps = followUps.filter(f => f.status === 'pending' && new Date(f.due_at) < new Date());
  const pendingFollowUps = followUps.filter(f => f.status === 'pending' && new Date(f.due_at) >= new Date());

  const s = {
    bg: '#0B0D18',
    surface: '#131627',
    surface2: '#1A1E33',
    border: '#242842',
    text: '#E6E9F5',
    muted: '#7880A3',
    green: '#2EC97A',
    greenBg: '#112B1E',
    blue: '#5190FF',
    blueBg: '#162040',
    red: '#F07070',
    redBg: '#281414',
    yellow: '#F0AC2A',
    yellowBg: 'rgba(240,172,42,0.12)',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: s.bg, display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 16px 12px',
        borderBottom: `1px solid ${s.border}`,
        flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          background: s.surface2, border: 'none', color: s.muted,
          borderRadius: 8, width: 36, height: 36, cursor: 'pointer',
          fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: s.greenBg, color: s.green,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 15, flexShrink: 0,
        }}>
          {salesperson.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, color: s.text }}>{salesperson.name}</div>
          {salesperson.whatsapp_number && (
            <div style={{ fontSize: 12, color: s.muted }}>{salesperson.whatsapp_number}</div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${s.border}`,
        padding: '0 12px', flexShrink: 0, overflowX: 'auto',
      }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '12px 14px', fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
            color: activeTab === tab ? s.green : s.muted,
            borderBottom: activeTab === tab ? `2px solid ${s.green}` : '2px solid transparent',
            whiteSpace: 'nowrap',
          }}>{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ color: s.muted, textAlign: 'center', paddingTop: 48 }}>Loading...</div>
        ) : (

          activeTab === 'Overview' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Clients Assigned', value: clients.length, color: s.blue, bg: s.blueBg },
                  { label: 'Open Deals', value: openDeals.length, color: s.yellow, bg: s.yellowBg },
                  { label: 'Closed This Month', value: closedThisMonth.length, color: s.green, bg: s.greenBg },
                  { label: 'Revenue This Month', value: revenueThisMonth > 0 ? formatAED(revenueThisMonth) : '—', color: s.green, bg: s.greenBg },
                ].map(stat => (
                  <div key={stat.label} style={{
                    background: stat.bg, border: `1px solid ${s.border}`,
                    borderRadius: 10, padding: '14px 14px',
                  }}>
                    <div style={{ fontSize: 11, color: s.muted, marginBottom: 6 }}>{stat.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${s.border}`, fontWeight: 600, fontSize: 13, color: s.text }}>Follow-ups</div>
                {[
                  { label: 'Overdue', count: overdueFollowUps.length, color: s.red },
                  { label: 'Due upcoming', count: pendingFollowUps.length, color: s.yellow },
                  { label: 'Completed total', count: followUps.filter(f => f.status === 'done').length, color: s.green },
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderBottom: `1px solid ${s.border}`, fontSize: 13,
                  }}>
                    <span style={{ color: s.muted }}>{row.label}</span>
                    <span style={{ fontWeight: 600, color: row.color }}>{row.count}</span>
                  </div>
                ))}
              </div>

              {activities.length > 0 && (
                <div style={{ background: s.surface, border: `1px solid ${s.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', borderBottom: `1px solid ${s.border}`, fontWeight: 600, fontSize: 13, color: s.text }}>
                    Recent Activity
                  </div>
                  {activities.slice(0, 5).map(act => (
                    <div key={act.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${s.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 12, color: s.text, fontWeight: 500 }}>
                          {ACTIVITY_LABELS[act.activity_type] || act.activity_type} — {act.customers?.name || '?'}
                        </span>
                        <span style={{ fontSize: 11, color: s.muted }}>{timeAgo(act.logged_at)}</span>
                      </div>
                      {act.note && <div style={{ fontSize: 12, color: s.muted }}>{act.note}</div>}
                    </div>
                  ))}
                  {activities.length > 5 && (
                    <div
                      onClick={() => setActiveTab('Activity')}
                      style={{ padding: '10px 14px', fontSize: 12, color: s.blue, cursor: 'pointer' }}
                    >
                      View all {activities.length} activities →
                    </div>
                  )}
                </div>
              )}
            </div>

          ) : activeTab === 'Activity' ? (
            <div>
              {activities.length === 0 ? (
                <div style={{ color: s.muted, textAlign: 'center', paddingTop: 48, fontSize: 13 }}>No activity logged in the last 60 days</div>
              ) : activities.map(act => (
                <div key={act.id} style={{
                  background: s.surface, border: `1px solid ${s.border}`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: s.text }}>
                        {ACTIVITY_LABELS[act.activity_type] || act.activity_type}
                      </span>
                      <span style={{ fontSize: 12, color: s.muted }}> · {act.customers?.name || '?'}</span>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                      <div style={{ fontSize: 11, color: s.muted }}>{formatDate(act.logged_at)}</div>
                      <div style={{ fontSize: 10, color: s.muted }}>{formatTime(act.logged_at)}</div>
                    </div>
                  </div>
                  {act.note && <div style={{ fontSize: 12, color: s.muted, marginTop: 4, lineHeight: 1.5 }}>{act.note}</div>}
                </div>
              ))}
            </div>

          ) : activeTab === 'Clients' ? (
            <div>
              {clients.length === 0 ? (
                <div style={{ color: s.muted, textAlign: 'center', paddingTop: 48, fontSize: 13 }}>No clients assigned</div>
              ) : clients.map(client => {
                const clientDeals = deals.filter(d => d.customer_id === client.id);
                const openDeal = clientDeals.find(d => !['closed', 'lost'].includes(d.stage));
                return (
                  <div key={client.id} style={{
                    background: s.surface, border: `1px solid ${s.border}`,
                    borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: s.text }}>{client.name}</div>
                        <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>{client.number}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: s.muted }}>Last active</div>
                        <div style={{ fontSize: 12, color: s.text }}>{client.last_active ? timeAgo(client.last_active) : '—'}</div>
                      </div>
                    </div>
                    {openDeal && (
                      <div style={{
                        marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', background: s.surface2, borderRadius: 6,
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: STAGE_COLORS[openDeal.stage] || s.muted, flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 12, color: s.muted }}>
                          {openDeal.brand} {openDeal.model} · {STAGE_LABELS[openDeal.stage] || openDeal.stage}
                        </span>
                        {openDeal.budget && (
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: s.text }}>{formatAED(openDeal.budget)}</span>
                        )}
                      </div>
                    )}
                    <div style={{ marginTop: 6, fontSize: 11, color: s.muted }}>
                      {clientDeals.length} deal{clientDeals.length !== 1 ? 's' : ''} total
                      {clientDeals.filter(d => d.stage === 'closed').length > 0 &&
                        ` · ${clientDeals.filter(d => d.stage === 'closed').length} closed`}
                    </div>
                  </div>
                );
              })}
            </div>

          ) : activeTab === 'Deals' ? (
            <div>
              {deals.length === 0 ? (
                <div style={{ color: s.muted, textAlign: 'center', paddingTop: 48, fontSize: 13 }}>No deals yet</div>
              ) : deals.map(deal => (
                <div key={deal.id} style={{
                  background: s.surface, border: `1px solid ${s.border}`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: s.text }}>
                        {deal.brand || '?'} {deal.model || ''}
                      </div>
                      <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>
                        {deal.customers?.name || '?'}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                      background: deal.stage === 'closed' ? s.greenBg : deal.stage === 'lost' ? s.redBg : s.surface2,
                      color: deal.stage === 'closed' ? s.green : deal.stage === 'lost' ? s.red : STAGE_COLORS[deal.stage] || s.muted,
                    }}>
                      {STAGE_LABELS[deal.stage] || deal.stage}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    {deal.budget && <span style={{ color: s.muted }}>Budget: <span style={{ color: s.text }}>{formatAED(deal.budget)}</span></span>}
                    {deal.value && <span style={{ color: s.muted }}>Value: <span style={{ color: s.text }}>{formatAED(deal.value)}</span></span>}
                  </div>
                  {deal.stage === 'closed' && deal.closed_at && (
                    <div style={{ fontSize: 11, color: s.muted, marginTop: 4 }}>Closed {formatDate(deal.closed_at)}</div>
                  )}
                </div>
              ))}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
