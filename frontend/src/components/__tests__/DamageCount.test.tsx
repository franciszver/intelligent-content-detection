import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DamageCount } from '../DamageCount';

describe('DamageCount', () => {
  it('should display "No damage detected" when damageCounts is empty', () => {
    render(<DamageCount damageCounts={{}} />);
    expect(screen.getByText(/No damage detected/i)).toBeInTheDocument();
  });

  it('should display damage counts by type', () => {
    const damageCounts = {
      missing_shingles: 5,
      torn_shingles: 3,
      water_stains: 2,
      hail_impact: 1,
    };

    render(<DamageCount damageCounts={damageCounts} />);

    expect(screen.getByText(/Damage Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing Shingles/i)).toBeInTheDocument();
    expect(screen.getByText(/Torn Shingles/i)).toBeInTheDocument();
    expect(screen.getByText(/Water Stains/i)).toBeInTheDocument();
    expect(screen.getByText(/Hail Impact/i)).toBeInTheDocument();
    
    // Use getAllByText for numbers that appear multiple times
    const count5 = screen.getAllByText('5');
    expect(count5.length).toBeGreaterThan(0);
    const count3 = screen.getAllByText('3');
    expect(count3.length).toBeGreaterThan(0);
    const count2 = screen.getAllByText('2');
    expect(count2.length).toBeGreaterThan(0);
    const count1 = screen.getAllByText('1');
    expect(count1.length).toBeGreaterThan(0);
  });

  it('should calculate and display total damage areas', () => {
    const damageCounts = {
      missing_shingles: 5,
      torn_shingles: 3,
      water_stains: 2,
    };

    render(<DamageCount damageCounts={damageCounts} />);

    expect(screen.getByText(/Total damage areas:/i)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('should handle unknown damage types', () => {
    const damageCounts = {
      unknown_damage: 2,
      custom_type: 1,
    };

    render(<DamageCount damageCounts={damageCounts} />);

    expect(screen.getByText(/unknown_damage/i)).toBeInTheDocument();
    expect(screen.getByText(/custom_type/i)).toBeInTheDocument();
  });
});

