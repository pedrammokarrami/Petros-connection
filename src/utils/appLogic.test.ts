import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleVote,
  filterAndSortPosts,
  computeNetworkStrength,
  formatClubTag,
  validatePostForm,
  validateClubForm,
  validateRuleForm,
  generateSquadReply,
  nextFriendshipStatus,
  searchPlayersByHandle,
  formatSharedTextMessage,
  generateDirectMessageReply,
} from './appLogic';
import type { PlayerProfile, Post } from '../types';

test('toggleVote handles upvote, undo, and switch cleanly', () => {
  assert.deepEqual(toggleVote(null, 10, 'up'), { score: 11, userVote: 'up' });
  assert.deepEqual(toggleVote('up', 11, 'up'), { score: 10, userVote: null });
  assert.deepEqual(toggleVote('up', 11, 'down'), { score: 9, userVote: 'down' });
  assert.deepEqual(toggleVote('down', 9, 'up'), { score: 11, userVote: 'up' });
  assert.deepEqual(toggleVote('down', 9, 'down'), { score: 10, userVote: null });
});

test('filterAndSortPosts filters by club tag, search query, and sort mode', () => {
  const posts: Post[] = [
    {
      id: '1',
      author: 'Nova',
      handle: 'Nova_Strike',
      gameTag: '#CS2',
      content: 'Mirage A-site smoke lineup update',
      timestamp: '5m ago',
      createdAtMs: 1000,
      score: 42,
      userVote: null,
      replies: [],
      isFollowing: true,
    },
    {
      id: '2',
      author: 'Kairo',
      handle: 'Kairo_GG',
      gameTag: '#FIFA',
      content: 'Weekend league midfield tactics',
      timestamp: '2m ago',
      createdAtMs: 2000,
      score: 18,
      userVote: null,
      replies: [],
      isFollowing: false,
    },
  ];

  const byTag = filterAndSortPosts(posts, { clubTag: '#CS2', searchQuery: '', sortMode: 'latest' });
  assert.equal(byTag.length, 1);
  assert.equal(byTag[0].id, '1');

  const byTop = filterAndSortPosts(posts, { clubTag: null, searchQuery: '', sortMode: 'top' });
  assert.equal(byTop[0].id, '1');

  const byLatest = filterAndSortPosts(posts, { clubTag: null, searchQuery: '', sortMode: 'latest' });
  assert.equal(byLatest[0].id, '2');

  const byFollowing = filterAndSortPosts(posts, { clubTag: null, searchQuery: '', sortMode: 'following' });
  assert.equal(byFollowing.length, 1);
  assert.equal(byFollowing[0].handle, 'Nova_Strike');

  const bySearch = filterAndSortPosts(posts, { clubTag: null, searchQuery: 'midfield', sortMode: 'latest' });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].id, '2');
});

test('computeNetworkStrength responds accurately to P2P, peers, and relay settings', () => {
  const offline = computeNetworkStrength({ p2pEnabled: false, maxPeers: 16, relayBridgeEnabled: false });
  assert.equal(offline.label, 'Offline');
  assert.equal(offline.activePeers, 0);

  const optimal = computeNetworkStrength({ p2pEnabled: true, maxPeers: 48, relayBridgeEnabled: true });
  assert.equal(optimal.label, 'Optimal');
  assert.ok(optimal.strengthPercent >= 85);
  assert.ok(optimal.estimatedPingMs <= 25);
  assert.ok(optimal.activePeers > 10);
});

test('formatClubTag normalizes club names cleanly', () => {
  assert.equal(formatClubTag('call of duty'), '#CallOfDuty');
  assert.equal(formatClubTag('#CS2'), '#CS2');
  assert.equal(formatClubTag('  apex legends! '), '#ApexLegends');
  assert.equal(formatClubTag('###'), '');
});

test('form validators catch invalid empty inputs and accept valid inputs', () => {
  assert.ok(validatePostForm('   ', '#CS2'));
  assert.ok(validatePostForm('hi', '#CS2'));
  assert.equal(validatePostForm('Looking for two players for ranked tonight.', '#CS2'), null);

  assert.ok(validateClubForm('', 'desc'));
  assert.ok(validateClubForm('!!!', 'desc'));
  assert.equal(validateClubForm('Valorant', 'Tactical scrims and callouts'), null);

  assert.ok(validateRuleForm('', 'Player joins club', 'Send welcome message', 'Welcome!'));
  assert.ok(validateRuleForm('Greeter', 'Player joins club', 'Send welcome message', '   '));
  assert.equal(validateRuleForm('Greeter', 'Player joins club', 'Send welcome message', 'Welcome to the squad!'), null);
});

test('generateSquadReply adapts to squad keywords', () => {
  const lfg = generateSquadReply('#CS2', 'Anyone LFG right now?');
  assert.equal(lfg.handle, 'Nova_Strike');
  assert.ok(lfg.content.includes('#CS2'));
});

test('nextFriendshipStatus transitions friend states cleanly', () => {
  assert.equal(nextFriendshipStatus('none'), 'pending_outgoing');
  assert.equal(nextFriendshipStatus('pending_incoming'), 'friends');
  assert.equal(nextFriendshipStatus('pending_outgoing'), 'pending_outgoing');
  assert.equal(nextFriendshipStatus('friends'), 'friends');
});

test('searchPlayersByHandle matches handles, names, and tags', () => {
  const players: PlayerProfile[] = [
    {
      id: 'p1',
      name: 'Lyra Crest',
      handle: 'Lyra_Crest',
      status: 'in-game',
      currentGame: 'CS2 · Faceit',
      role: 'AWPer',
      mainTag: '#CS2',
      friendship: 'none',
    },
    {
      id: 'p2',
      name: 'Soren Drift',
      handle: 'Soren_Drift',
      status: 'online',
      currentGame: 'FIFA · Pro Clubs',
      role: 'Striker',
      mainTag: '#FIFA',
      friendship: 'none',
    },
  ];

  assert.equal(searchPlayersByHandle(players, 'lyra').length, 1);
  assert.equal(searchPlayersByHandle(players, '#fifa')[0].handle, 'Soren_Drift');
  assert.equal(searchPlayersByHandle(players, '').length, 2);
});

test('formatSharedTextMessage formats posts, clubs, and profiles with optional notes', () => {
  const msg = formatSharedTextMessage(
    {
      kind: 'club',
      title: '#CS2',
      subtitle: '89 active',
      previewText: 'Premier ELO stacks and utility lineups.',
      shareUrl: 'https://aigameria.app/clubs/cs2',
    },
    'Jump in tonight',
  );
  assert.ok(msg.startsWith('Jump in tonight — Club Invite — #CS2'));

  const reply = generateDirectMessageReply(
    {
      id: 'p1',
      name: 'Nova Strike',
      handle: 'Nova_Strike',
      status: 'online',
      role: 'Lead',
      mainTag: '#CS2',
      friendship: 'friends',
    },
    msg,
  );
  assert.ok(reply.includes('appreciate the share'));
});

