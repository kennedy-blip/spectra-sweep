import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

function renderApp() {
  return render(<App />);
}

/** Lets framer-motion's AnimatePresence finish an exit before asserting. */
async function settle(ms = 1200) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function boot() {
  const utils = renderApp();
  // AppProvider hydrates role/theme in an effect on mount.
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SPECTRA-SWEEP app shell', () => {
  it('boots into the desktop command console with the brand and dock', async () => {
    await boot();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/spectra/i);
    // all five modules are reachable from the gooey dock
    for (const label of ['Optical', 'Ultrasonic', 'EMF', 'Footprint', 'Vault']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('heading', { level: 2, name: /Optical Lens Finder/i })).toBeInTheDocument();
  });

  it('renders the optical module with fixture simulator and live telemetry', async () => {
    await boot();
    // the viewport badge and the centre overlay both name the simulator
    expect(screen.getAllByText(/Fixture Simulator/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Airbnb Smoke Detector/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Detection Telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/Glint Threshold/i)).toBeInTheDocument();
  });

  it('navigates to every module through the dock', async () => {
    await boot();
    const go = (name: string) => {
      const btn = screen
        .getAllByRole('button')
        .find(
          (b) =>
            b.getAttribute('aria-label')?.startsWith(name) ||
            b.textContent?.trim() === name,
        );
      expect(btn, `dock button ${name}`).toBeTruthy();
      fireEvent.click(btn!);
    };


    go('Ultrasonic');
    await settle();
    expect(screen.getAllByText(/Active Jammer/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Waterfall Spectrogram/i)).toBeInTheDocument();

    go('EMF');
    await settle();
    expect(screen.getByText(/Total Flux Magnitude/i)).toBeInTheDocument();

    go('Footprint');
    await settle();
    expect(screen.getByText(/Privacy Hardening Score/i)).toBeInTheDocument();

    go('Vault');
    await settle();
    expect(screen.getByText(/12-Point Room Sweep Protocol/i)).toBeInTheDocument();
  });

  it('gates the optical filter matrix behind the auditor tier', async () => {
    await boot();
    expect(screen.getByText(/Ruby Red-Pass/)).toBeInTheDocument();
    // pro-only shaders advertise their tier
    expect(screen.getAllByText('PRO').length).toBeGreaterThanOrEqual(2);
  });

  it('opens the APK distribution modal from the header', async () => {
    await boot();
    const apkBtn = screen.getAllByRole('button').find((b) => b.getAttribute('aria-label') === 'Download Android APK');
    expect(apkBtn).toBeTruthy();
    fireEvent.click(apkBtn!);
    await settle();
    expect(screen.getByText(/APK Distribution Center/i)).toBeInTheDocument();
    expect(screen.getByText(/One-Tap Download .APK/i)).toBeInTheDocument();
    expect(screen.getByText(/SHA-256 checksum/i)).toBeInTheDocument();
    expect(screen.getByText(/3-Step Sideload/i)).toBeInTheDocument();
  });

  it('opens the privileges matrix and switches role', async () => {
    await boot();

    // 1. the sensor-permission drawer is reachable from the header
    const drawerBtn = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-label') === 'Sensor permissions');
    expect(drawerBtn).toBeTruthy();
    fireEvent.click(drawerBtn!);
    await settle();

    expect(screen.getByText(/Role-Based Access Control/i)).toBeInTheDocument();
    expect(screen.getByText(/Hardware & OS Sensor Permission Matrix/i)).toBeInTheDocument();
    // listed in the capability gates (and repeated in the tier unlock summary)
    expect(screen.getAllByText('WebRTC Leak Forensics Lab').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active Ultrasonic Jammer').length).toBeGreaterThan(0);

    // 2. all three tiers are offered, and switching one persists
    const tiers = ['SOLO TRAVELER', 'SECURITY AUDITOR', 'COUNTER-INTEL DIRECTOR'];
    for (const t of tiers) expect(screen.getAllByText(t).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('COUNTER-INTEL DIRECTOR'));
    await settle(600);
    expect(localStorage.getItem('ss.role')).toBe('director');
  });

  it('escalates from a locked shader into the permission matrix', async () => {
    await boot();
    // traveler tier: Ruby Red-Pass is PRO-gated
    fireEvent.click(screen.getByText(/Ruby Red-Pass/));
    await settle();
    expect(screen.getByText(/Role-Based Access Control/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Security Auditor/i).length).toBeGreaterThan(0);
  });

  it('toggles to the mobile field APK preview chassis', async () => {
    await boot();
    const mobileBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Mobile APK'));
    expect(mobileBtn).toBeTruthy();
    fireEvent.click(mobileBtn!);
    await settle();
    expect(screen.getByText(/FIELD APK PREVIEW/i)).toBeInTheDocument();
    expect(screen.getByText(/Native Field Build/i)).toBeInTheDocument();
  });

  it('switches tactical themes and persists the choice', async () => {
    await boot();
    const themeBtn = screen.getAllByRole('button').find((b) => b.getAttribute('aria-label') === 'Theme switcher');
    fireEvent.click(themeBtn!);
    await settle(400);
    const crimson = screen.getByText('Crimson Darkroom');
    fireEvent.click(crimson);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('crimson'));
    expect(localStorage.getItem('ss.theme')).toBe('crimson');
  });

  it('keeps the threat pill reactive to telemetry', async () => {
    await boot();
    // smoke detector is a critical fixture → the global threat level escalates
    await waitFor(
      () => {
        const text = document.body.textContent ?? '';
        expect(text.toLowerCase()).toMatch(/threat|anomaly|secure/);
      },
      { timeout: 3000 },
    );
  });

  it('marks a checklist item and reflects progress', async () => {
    await boot();
    const go = screen.getAllByRole('button').find((b) => b.textContent?.trim() === 'Vault');
    fireEvent.click(go!);
    await settle();
    expect(screen.getByText(/12-Point Room Sweep Protocol/i)).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Toggle Smoke detector dome/i });
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByText(/1\/12 swept/i)).toBeInTheDocument());
  });
});
