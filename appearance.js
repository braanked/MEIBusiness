/* Animate optical layers only; content and hit areas stay in place. */
(function() {
    'use strict';
    const root = document.documentElement;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const compact = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    const supportsGlass = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
    const selector = '.glass, .card, dialog, .primary, .mode, #toast';
    const properties = ['--glass-x', '--glass-y', '--glass-light', '--glass-pointer-x', '--glass-pointer-y'];
    const options = { passive: true };
    let active = null, bounds = null, pointer = null;
    let raf = 0, refreshRaf = 0, last = 0;
    let x = 0, y = 0, light = 0, targetX = 0, targetY = 0, targetLight = 0;
    let limit = compact ? 5 : 10;

    root.dataset.appearance = 'liquid';
    root.classList.toggle('glass-lite', compact);

    function clear() {
        cancelAnimationFrame(raf);
        raf = last = 0;
        if (active) properties.forEach(name => active.style.removeProperty(name));
        active = bounds = null;
        x = y = light = targetX = targetY = targetLight = 0;
    }

    function stop() {
        cancelAnimationFrame(refreshRaf);
        refreshRaf = 0;
        pointer = null;
        clear();
    }

    function frame(time) {
        raf = 0;
        if (!active || !active.isConnected || document.hidden || reduced.matches) {
            stop();
            return;
        }
        const alpha = 1 - Math.exp(-Math.min(64, time - (last || time - 16)) / 85);
        last = time;
        x += (targetX - x) * alpha;
        y += (targetY - y) * alpha;
        light += (targetLight - light) * alpha;
        active.style.setProperty('--glass-x', x.toFixed(2) + 'px');
        active.style.setProperty('--glass-y', y.toFixed(2) + 'px');
        active.style.setProperty('--glass-light', light.toFixed(3));
        active.style.setProperty('--glass-pointer-x', (50 + x / limit * 50).toFixed(2) + '%');
        active.style.setProperty('--glass-pointer-y', (50 + y / (limit * .6) * 50).toFixed(2) + '%');
        if (Math.abs(targetX - x) + Math.abs(targetY - y) + Math.abs(targetLight - light) > .015) raf = requestAnimationFrame(frame);
        else if (!targetLight) clear();
    }

    function schedule() {
        if (!raf) {
            last = 0;
            raf = requestAnimationFrame(frame);
        }
    }

    function leave() {
        targetX = targetY = targetLight = 0;
        if (active) schedule();
    }

    function point(event) {
        pointer = { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType };
        const surface = event.target?.closest(selector);
        if (!surface) {
            leave();
            return;
        }
        if (surface !== active) {
            clear();
            active = surface;
        }
        // Cache geometry until entry, scrolling or resizing changes it.
        if (!bounds) bounds = active.getBoundingClientRect();
        if (!bounds.width || !bounds.height || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
            leave();
            return;
        }
        limit = compact || event.pointerType === 'touch' ? 5 : 10;
        targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)) * limit;
        targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)) * limit * .6;
        targetLight = event.pointerType === 'touch' ? .65 : 1;
        schedule();
    }

    function refresh() {
        bounds = null;
        if (!pointer || refreshRaf) return;
        refreshRaf = requestAnimationFrame(() => {
            refreshRaf = 0;
            if (pointer && !document.hidden) point({ ...pointer, target: document.elementFromPoint(pointer.clientX, pointer.clientY) });
        });
    }

    function release(event) {
        if (event.pointerType !== 'mouse') {
            pointer = null;
            leave();
        }
    }

    function move(event) {
        if (event.pointerType !== 'touch') point(event);
    }

    function visibility() {
        if (document.hidden) stop();
    }

    function out(event) {
        if (!event.relatedTarget) {
            pointer = null;
            leave();
        }
    }

    function cancel() {
        pointer = null;
        leave();
    }

    function attach() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerdown', point);
        document.removeEventListener('pointerup', release);
        document.removeEventListener('pointercancel', cancel);
        document.removeEventListener('pointerout', out);
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('blur', stop);
        window.removeEventListener('resize', refresh);
        window.removeEventListener('scroll', refresh, true);
        window.removeEventListener('pagehide', stop);
        stop();
        if (reduced.matches || !supportsGlass) return;
        document.addEventListener('pointermove', move, options);
        document.addEventListener('pointerdown', point, options);
        document.addEventListener('pointerup', release, options);
        document.addEventListener('pointercancel', cancel, options);
        document.addEventListener('pointerout', out, options);
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('blur', stop);
        window.addEventListener('resize', refresh);
        window.addEventListener('scroll', refresh, { passive: true, capture: true });
        window.addEventListener('pagehide', stop);
    }

    reduced.addEventListener('change', attach);
    window.MEIBusinessAppearance = { stop };
    attach();
})();
