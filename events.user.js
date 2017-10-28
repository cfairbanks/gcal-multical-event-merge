// ==UserScript==
// @name        Event Merge for Google Calendar™ (by @imightbeAmy)
// @namespace   gcal-multical-event-merge
// @include     https://www.google.com/calendar/*
// @include     http://www.google.com/calendar/*
// @include     https://calendar.google.com/*
// @include     http://calendar.google.com/*
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.0/jquery.min.js
// @version     1
// @grant       none
// ==/UserScript==

'use strict';

function LegacyEventMerger(key_function, do_clean_up) {
    this.makeKey = key_function;
    this.do_clean_up = do_clean_up;
}

LegacyEventMerger.prototype = {
    /**
     * Return background color of the calendar event,
     * or the text color if the event is transparent,
     * as is the case for events with times in the monthly view
     * in the calendar's pre-material design.
     */
    getBackgroundColor: function ($event) {
        var color = $event.css('background-color');

        if (isTransparent(color)) {
            return $event.css('color');
        } else {
            return color;
        }
    },
    makeAltTextColors: function ($element, colors) {
        $element.prepend(" ");
        $element.find(".color-bar").remove();
        $.each(colors.reverse(), function (i, color) {
            $element.prepend($("<span>")
                .addClass('color-bar')
                .css({
                    'background-color': color,
                    'width': '4px',
                    'height': '12px',
                    'display': 'inline-block'
                }));
        });
    },
    mergeEvents: function (name, event_set) {
        if (event_set.length > 1) {
            var getBackgroundColor = this.getBackgroundColor;
            var colors = $.map(event_set, function (event) {
                return getBackgroundColor($(event));
            });

            var keep = event_set.shift();
            $(event_set).each(function (i, $event) {
                hideEvent($event.parent());
            });

            if (isTransparent(keep.css('background-color'))) {
                this.makeAltTextColors(keep, colors);
            } else {
                makeStripes(keep, colors);
            }

            if (this.do_clean_up) {
                cleanUp(keep.parents('.chip'));
            }
        }
    },
    mergeSets: function ($events) {
        var sets = getEventSets($events, this.makeKey);
        $.each(sets, $.proxy(this.mergeEvents, this));
    }
};

/*****************************************************************************/

function getEventSets($events, make_key_function) {
    var event_sets = {};
    $events.each(function () {
        var $event = $(this),
            key = make_key_function($event).replace(/\s/g, '');
        event_sets[key] = event_sets[key] || [];
        event_sets[key].push($event);
    });
    return event_sets;
}

function makeStripes($element, colors) {
    var gradient = "repeating-linear-gradient( 45deg,",
        pos = 0;
    $.each(colors, function (i, color) {
        gradient += color + " " + pos + "px,";
        pos += 10;
        gradient += color + " " + pos + "px,";
    });
    gradient = gradient.slice(0, -1);
    gradient += ")";
    $element.css('background-image', gradient);
}

function isTransparent(color) {
  return color.indexOf('rgba') !== -1;
}

function isWhite(color) {
    return color === 'rgb(255, 255, 255)';
}

function getValidColor(colors) {
    for (var i = 0; i < colors.length; i++) {
        var color = colors[i];

        if (color !== undefined && !isTransparent(color) && !isWhite(color)) {
            return color;
        }
    }

    return 'white';
}

function cleanEventTitle(event_title) {
    return event_title.trim()
        .replace(/\(.*\)$/, ''); // Remove parentheticals at end for 1:1 lab
}

function getLegacyWeekTimedEventKey($event) {
    var event_name = cleanEventTitle($event.find('dd .evt-lk').text()),
        event_time = $event.find('dt').text(),
        col = $event.parents('.tg-col-eventwrapper').attr('id');
    return event_name + event_time + col;
}

function getLegacyWeekAllDayEventKey($event) {
    return getTableEventKey($event);
}

function getTableEventKey($event) {
    var event_name = cleanEventTitle($event.text()),
        $td = $event.parents('td'),
        days = $td.attr("colspan") || 1,
        col = $td.position().left;
    return event_name + ":" + col + ":" + days;
}

function getLegacyMonthAllDayEventKey($event) {
    var row = $event.parents('.month-row').index();
    return getTableEventKey($event) + ":" + row;
}

function getLegacyMonthTimedEventKey($event) {
    var time = $event.find('.te-t').text();
    return getLegacyMonthAllDayEventKey($event) + time;
}

function hideEvent($event) {
    $event.css('visibility', 'hidden');
    $event.find('*').css('visibility', 'hidden');
}

function cleanUp($keep) {
    if ($keep[0]) {
        var left = Number($keep[0].style.left.replace(/%/g, ''));
        $keep.css('width', 100 - (isNaN(left) ? 0 : left) + "%");
    }
}

var weekTimed = new LegacyEventMerger(getLegacyWeekTimedEventKey, true),
    weekAllDay = new LegacyEventMerger(getLegacyWeekAllDayEventKey),
    monthTimed = new LegacyEventMerger(getLegacyMonthTimedEventKey),
    monthAllDay = new LegacyEventMerger(getLegacyMonthAllDayEventKey);

chrome.runtime.sendMessage({}, function(response) {
  if (response.enabled) {
    var merging_main = false;
    $(document).on("DOMNodeInserted", "#gridcontainer", function () {
        if (!merging_main) {
            merging_main = true;
            var grid_container = $(this);
            weekTimed.mergeSets(grid_container.find('dl'));
            weekAllDay.mergeSets(grid_container.find(".wk-weektop .rb-n"));
            monthTimed.mergeSets(grid_container.find(".te"));
            monthAllDay.mergeSets(grid_container.find(".mv-event-container .rb-n"));
            merging_main = false;
        }
    });

    var merging_find_time = false;
    $(document).on("DOMNodeInserted", "#scTgTable", function (e) {
        if (!merging_find_time) {
            merging_find_time = true;
            var find_time_container = $(this);
            weekTimed.mergeSets(find_time_container.find('dl'));
            weekAllDay.mergeSets(find_time_container.find(".rb-n"));
            merging_find_time = false;
        }
    });
  }
});
