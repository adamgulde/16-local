import { useEffect, useState, useMemo } from 'react';
import {
  fetchUserFriends,
  fullName,
  type FriendSummary,
  type FriendSortOption,
  type SortOrder,
} from '../../services/userService';
import { ChevronRightIcon, SearchIcon } from '../Icons';

interface MillerColumnProps {
  ownerId: string;
  ownerName: string;
  depth: number;
  selectedUserId: string | null;
  onSelectUser: (user: FriendSummary, depth: number) => void;
  onInspectUser?: (user: FriendSummary) => void;
  currentUserId: string;
  isMobile?: boolean;
  width?: number | string;
  disabledUserIds?: Set<string>;
}

const getAvatarColor = (name: string): string => {
  const colors = [
    '#3d8bff', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#6366f1'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const MillerColumn = ({
  ownerId,
  ownerName,
  depth,
  selectedUserId,
  onSelectUser,
  onInspectUser,
  currentUserId,
  isMobile = false,
  width = 320,
  disabledUserIds,
}: MillerColumnProps) => {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sorting state
  const [sortBy, setSortBy] = useState<FriendSortOption>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Filter state
  const [filterText, setFilterText] = useState('');

  // Fetch friends whenever ownerId, sortBy, or sortOrder changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchUserFriends(ownerId, sortBy, sortOrder)
      .then((data) => {
        if (active) {
          setFriends(data.filter((f) => f.id !== currentUserId));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.response?.data?.message || 'Failed to load connections');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [ownerId, sortBy, sortOrder]);

  // Client-side quick filter
  const filteredFriends = useMemo(() => {
    if (!filterText.trim()) return friends;
    const q = filterText.toLowerCase();
    return friends.filter((f) => fullName(f).toLowerCase().includes(q));
  }, [friends, filterText]);

  const handleSortChange = (value: string) => {
    const [newSort, newOrder] = value.split('-') as [FriendSortOption, SortOrder];
    setSortBy(newSort);
    setSortOrder(newOrder);
  };

  return (
    <div
      style={{
        width: isMobile ? '100%' : width,
        minWidth: isMobile ? '100%' : width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1c1c1e',
        borderRight: isMobile ? 'none' : '1px solid #3a3a40',
        color: '#f0f0f0',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Column Header */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #2c2c2e',
          background: 'rgba(28, 28, 30, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: isMobile ? '200px' : '180px',
              }}
              title={ownerName}
            >
              {ownerName}
            </h3>
          </div>
          <span style={{ fontSize: '12px', color: '#9a9a9a' }}>
            {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
          </span>
        </div>

        {/* Sort selector & Search bar */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span style={{ position: 'absolute', left: '8px', display: 'flex', color: '#6a6a70', pointerEvents: 'none' }}>
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              placeholder="Filter..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px 6px 28px',
                background: '#2c2c2e',
                border: '1px solid #3a3a40',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => handleSortChange(e.target.value)}
            style={{
              padding: '6px 8px',
              background: '#2c2c2e',
              border: '1px solid #3a3a40',
              borderRadius: '6px',
              color: '#d0d0d0',
              fontSize: '12px',
              cursor: 'pointer',
              outline: 'none',
            }}
            title="Sort options"
          >
            <option value="name-asc">Name (A → Z)</option>
            <option value="name-desc">Name (Z → A)</option>
            <option value="mutualFriends-desc">Most Mutual</option>
            <option value="mutualFriends-asc">Least Mutual</option>
            <option value="connections-desc">Most Connections</option>
            <option value="connections-asc">Least Connections</option>
          </select>
        </div>
      </div>

      {/* Friends List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
        }}
      >
        {loading && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9a9a9a', fontSize: '13px' }}>
            Loading connections...
          </div>
        )}

        {error && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#ff6b6b', fontSize: '13px' }}>
            <p style={{ margin: '0 0 8px' }}>{error}</p>
            <button
              onClick={() => {
                setSortBy((s) => s);
              }}
              style={{
                padding: '4px 12px',
                background: '#2c2c2e',
                border: '1px solid #3a3a40',
                color: '#6ab0ff',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && filteredFriends.length === 0 && (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: '#6a6a70', fontSize: '13px' }}>
            {friends.length === 0 ? 'No connections found' : 'No matches for filter'}
          </div>
        )}

        {!loading && !error && filteredFriends.map((friend) => {
          const isSelected = selectedUserId === friend.id;
          const isSelf = friend.id === currentUserId;
          const isDisabled = Boolean(disabledUserIds?.has(friend.id));
          const name = fullName(friend);
          const initials = `${friend.firstName?.[0] || ''}${friend.lastName?.[0] || ''}`.toUpperCase();
          const avatarBg = getAvatarColor(name);

          return (
            <div
              key={friend.id}
              onClick={() => {
                if (isDisabled) return;
                onSelectUser(friend, depth);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '8px',
                background: isSelected
                  ? 'rgba(61, 139, 255, 0.18)'
                  : isDisabled
                  ? 'rgba(255, 255, 255, 0.02)'
                  : '#242426',
                border: `1px solid ${
                  isSelected
                    ? '#3d8bff'
                    : isDisabled
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'transparent'
                }`,
                opacity: isDisabled ? 0.45 : 1,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !isDisabled) {
                  e.currentTarget.style.background = '#2c2c2e';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !isDisabled) {
                  e.currentTarget.style.background = '#242426';
                }
              }}
              title={isDisabled ? `${name} (already in breadcrumbs)` : name}
            >
              {/* Avatar + Details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '16px',
                    background: avatarBg,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? '#fff' : '#f0f0f0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={name}
                    >
                      {name}
                    </span>
                    {isSelf && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#6ab0ff',
                          background: 'rgba(61, 139, 255, 0.15)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        you
                      </span>
                    )}
                    {isDisabled && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#8a8a92',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 500,
                        }}
                        title="Already in breadcrumbs trail"
                      >
                        in trail
                      </span>
                    )}
                  </div>

                  {/* Metrics Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#9a9a9a',
                      }}
                    >
                      {friend.connectionsCount} {friend.connectionsCount === 1 ? 'conn' : 'conns'}
                    </span>

                    {!isSelf && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: friend.mutualFriendsCount > 0 ? '#10b981' : '#6a6a70',
                          background: friend.mutualFriendsCount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                          padding: friend.mutualFriendsCount > 0 ? '0 4px' : '0',
                          borderRadius: '3px',
                        }}
                      >
                        {friend.mutualFriendsCount} mutual
                      </span>
                    )}

                    {!isSelf && friend.isConnectedToViewer && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#10b981',
                          fontWeight: 500,
                        }}
                      >
                        • 1st
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action / Chevron */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                {isMobile && onInspectUser && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectUser(friend);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9a9a9a',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      fontSize: '12px',
                      borderRadius: '4px',
                    }}
                    title="View Details"
                  >
                    ⓘ
                  </button>
                )}
                {isDisabled ? (
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#55555c',
                      padding: '0 4px',
                      userSelect: 'none',
                    }}
                    title="Already in breadcrumbs trail"
                  >
                    —
                  </span>
                ) : (
                  <span
                    style={{
                      color: isSelected ? '#3d8bff' : '#6a6a70',
                      display: 'flex',
                      alignItems: 'center',
                      transform: isSelected ? 'translateX(2px)' : 'none',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <ChevronRightIcon size={16} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
