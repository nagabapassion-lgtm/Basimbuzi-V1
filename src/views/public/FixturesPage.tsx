import React, { useEffect, useMemo, useState } from 'react';
import { ClubFixture } from '../../types';
import { ArrowLeft, Calendar, MapPin, Trophy } from 'lucide-react';

interface FixturesPageProps {
  clubName: string;
  fixtures: ClubFixture[];
  onBackHome: () => void;
  onGoJoinClub: () => void;
}

const FIXTURE_TAB_STORAGE_KEY = 'scb_public_fixture_tab_v1';
const FIXTURE_COMP_STORAGE_KEY = 'scb_public_fixture_comp_v1';

export const FixturesPage: React.FC<FixturesPageProps> = ({
  clubName,
  fixtures,
  onBackHome,
  onGoJoinClub
}) => {
  const [fixtureTab, setFixtureTab] = useState<'UPCOMING' | 'COMPLETED'>(() => {
    if (typeof window === 'undefined') return 'UPCOMING';
    try {
      const saved = window.localStorage.getItem(FIXTURE_TAB_STORAGE_KEY);
      return saved === 'COMPLETED' ? 'COMPLETED' : 'UPCOMING';
    } catch {
      return 'UPCOMING';
    }
  });
  const [competitionFilter, setCompetitionFilter] = useState<string>(() => {
    if (typeof window === 'undefined') return 'All';
    try {
      return window.localStorage.getItem(FIXTURE_COMP_STORAGE_KEY) || 'All';
    } catch {
      return 'All';
    }
  });

  const competitions = useMemo(() => {
    const unique = new Set<string>();
    (fixtures || []).forEach(f => {
      if (f.competition) unique.add(f.competition);
    });
    return ['All', ...Array.from(unique)];
  }, [fixtures]);

  useEffect(() => {
    if (fixtures.length > 0 && competitionFilter !== 'All' && !competitions.includes(competitionFilter)) {
      setCompetitionFilter('All');
    }
  }, [fixtures.length, competitions, competitionFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FIXTURE_TAB_STORAGE_KEY, fixtureTab);
    } catch {}
  }, [fixtureTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FIXTURE_COMP_STORAGE_KEY, competitionFilter);
    } catch {}
  }, [competitionFilter]);

  const upcomingFixtures = useMemo(() => {
    return (fixtures || [])
      .filter(f => f.status === 'UPCOMING' || f.status === 'POSTPONED')
      .filter(f => competitionFilter === 'All' || f.competition === competitionFilter)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [fixtures, competitionFilter]);

  const completedFixtures = useMemo(() => {
    return (fixtures || [])
      .filter(f => f.status === 'COMPLETED')
      .filter(f => competitionFilter === 'All' || f.competition === competitionFilter)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [fixtures, competitionFilter]);

  const nextMatch = upcomingFixtures[0] || null;

  const formatReadableDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const displayedList = fixtureTab === 'UPCOMING' ? upcomingFixtures : completedFixtures;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-14 space-y-10">
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Club Home</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Matchday Center · {clubName}
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white mt-1">
              Fixtures &amp; Match Results
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-2 max-w-2xl">
              Follow upcoming kickoff dates, match venues, and verified full-time results across all competitions.
            </p>
          </div>

          <button
            type="button"
            onClick={onGoJoinClub}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors self-start md:self-auto cursor-pointer"
          >
            <span>Supporter Matchday Updates</span>
          </button>
        </div>
      </div>

      {/* Next Match Spotlight Card */}
      {nextMatch && (
        <section className="rounded-2xl bg-slate-900 dark:bg-slate-900 text-white border border-slate-800 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              Next Scheduled Match · {nextMatch.competition}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {nextMatch.isHome ? `${clubName} vs ${nextMatch.opponent}` : `${nextMatch.opponent} vs ${clubName}`}
            </h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm text-slate-300 tabular-nums pt-1">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-400" />
                {formatReadableDate(nextMatch.date)} · {nextMatch.time} EAT
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-400" />
                {nextMatch.venue} ({nextMatch.isHome ? 'Home Ground' : 'Away'})
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-200 text-xs font-semibold text-center tabular-nums">
              {nextMatch.status === 'POSTPONED' ? 'Postponed' : `Kickoff ${nextMatch.time} EAT`}
            </div>
          </div>
        </section>
      )}

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setFixtureTab('UPCOMING')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              fixtureTab === 'UPCOMING'
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            Upcoming ({upcomingFixtures.length})
          </button>
          <button
            type="button"
            onClick={() => setFixtureTab('COMPLETED')}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              fixtureTab === 'COMPLETED'
                ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            Recent Results ({completedFixtures.length})
          </button>
        </div>

        {competitions.length > 2 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {competitions.map(comp => (
              <button
                key={comp}
                type="button"
                onClick={() => setCompetitionFilter(comp)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  competitionFilter === comp
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                {comp}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Match List */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
        {displayedList.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Trophy className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              No {fixtureTab === 'UPCOMING' ? 'upcoming fixtures' : 'completed results'} found for this filter.
            </p>
          </div>
        ) : (
          displayedList.map(fix => {
            const homeTeam = fix.isHome ? clubName : fix.opponent;
            const awayTeam = fix.isHome ? fix.opponent : clubName;

            return (
              <div
                key={fix.id}
                className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">{fix.competition}</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span>{formatReadableDate(fix.date)}</span>
                    <span className="mx-2" aria-hidden="true">·</span>
                    <span>{fix.time} EAT</span>
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-slate-950 dark:text-white">
                    {homeTeam} <span className="text-slate-400 font-normal mx-1.5">vs</span> {awayTeam}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{fix.venue} ({fix.isHome ? 'Home' : 'Away'})</span>
                  </div>
                  {fix.summary && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 pt-1 max-w-2xl">{fix.summary}</p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  {fix.status === 'COMPLETED' && fix.homeScore !== undefined && fix.awayScore !== undefined ? (
                    <div className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-lg font-extrabold text-slate-950 dark:text-white tabular-nums">
                      {fix.homeScore} – {fix.awayScore}
                    </div>
                  ) : (
                    <div className="px-3.5 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
                      {fix.status === 'POSTPONED' ? 'Postponed' : `Kickoff ${fix.time}`}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
};
