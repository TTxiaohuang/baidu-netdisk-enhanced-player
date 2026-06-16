// ==UserScript==
// @name         百度网盘增强播放器
// @namespace    https://github.com/TTxiaohuang
// @version      2.1.0
// @description  为百度网盘网页端注入解锁720P画质、无极调速、极速秒开、记忆播放、选集、画中画、添加字幕等高级功能。
// @author       TTxiaohuang & Refactored
// @include      *://yun.baidu.com/*
// @include      *://pan.baidu.com/*
// @match        https://pan.baidu.com/mbox/streampage*
// @connect      baidu.com
// @connect      baidupcs.com
// @require      https://cdn.jsdelivr.net/npm/hls.js@1.6.16/dist/hls.min.js
// @require      https://cdn.jsdelivr.net/npm/dplayer@1.27.1/dist/DPlayer.min.js
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzA2YyIgZD0iTTEyIDJDMi41IDIgMCA0LjUgMCAxMnM0LjUgMTAgMTIgMTAgMTAtNC41IDEwLTEwUzIxLjUgMiAxMiAyem0tMiAxNC41di05bDYgNC41LTYgNC41eiIvPjwvc3ZnPg==
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';
    console.log("[TTxiaohuang] 脚本开始运行! 当前网址:", location.href);

    var obj = {
        video_page: {
            info: [],
            quality: [],
            categorylist: [],
            sub_info: [],
            adToken: "",
            flag: ""
        }
    };

    // ==================== 工具函数 ====================
    obj.escapeHtml = function (text) {
        if (!text) return "";
        var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, function (m) { return map[m]; });
    };

    obj.require = function (name) { return unsafeWindow.require(name); };

    obj.async = function (name, callback) {
        obj.video_page.flag === "pfilevideo" ? callback("") : unsafeWindow.require.async(name, callback);
    };

    obj.getVip = function () {
        try {
            return obj.video_page.flag === "pfilevideo" ? function () {
                if (window.locals) {
                    var isSvip = 1 === +window.locals.is_svip;
                    var isVip = 1 === +window.locals.is_vip;
                    return isSvip ? 2 : isVip ? 1 : 0;
                }
                return 0;
            }() : obj.require("base:widget/vip/vip.js").getVipValue();
        } catch (e) {
            console.warn("[百度网盘播放器] 获取VIP身份异常，默认按免费用户处理", e);
            return 0;
        }
    };

    obj.msg = function (msg, mode) {
        try {
            if (obj.video_page.flag === "pfilevideo") {
                unsafeWindow.toast.show({ type: mode || "success", message: msg, duration: 5000 });
            } else {
                obj.require("system-core:system/uiService/tip/tip.js").show({ vipType: "svip", mode: mode || "success", msg: msg });
            }
        } catch (e) { console.warn("[百度网盘播放器] 提示消息显示失败:", e); }
    };

    obj.getParam = function (e, t) {
        var escaped = String(e).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var n = new RegExp("(?:^|\\?|#|&)" + escaped + "=([^&#]*)(?:$|&|#)", "i");
        var i = n.exec(t || location.href);
        return i ? i[1] : "";
    };

    obj.pageReady = function (callback) {
        if (obj.video_page.flag === "pfilevideo") {
            var retryCount = 0;
            (function checkReady() {
                var appdom = document.querySelector("#app");
                if (appdom && appdom.__vue_app__) callback && callback();
                else if (++retryCount < 100) setTimeout(checkReady, 50);
            })();
        } else {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                setTimeout(callback, 1);
            } else {
                document.addEventListener('DOMContentLoaded', callback);
            }
        }
    };

    obj.getPoster = function () {
        var file = obj.video_page.info.length ? obj.video_page.info[0] : "";
        if (file && file.thumbs) return Object.values(file.thumbs).pop();
        return "";
    };

    obj.injectCSS = function() {
        if (document.getElementById('dplayer-enhanced-styles')) return;
        var style = document.createElement('style');
        style.id = 'dplayer-enhanced-styles';
        style.textContent = `
            .dplayer-setting-custom-speed { display:none; right:72px; position:absolute; bottom:50px; width:150px; border-radius:2px; background:rgba(28,28,28,.9); padding:7px 0; transition:all .3s ease-in-out; overflow:hidden; z-index:2; }
            .dplayer-speed-item { padding:5px 10px; box-sizing:border-box; cursor:pointer; position:relative; }
            .dplayer-speed-label { color:#eee; font-size:13px; display:inline-block; vertical-align:middle; white-space:nowrap; }
            .dplayer-speed-input { width:55px; height:15px; top:3px; font-size:13px; border:1px solid #fff; border-radius:3px; text-align:center; }
            .dplayer-pip-btn { display:inline-block; height:100%; }
            .playlist-content { max-width:80%; max-height:330px; overflow:hidden; position:absolute; left:0; transition:all .38s ease-in-out; bottom:52px; overflow-y:auto; transform:scale(0); z-index:2; }
            .playlist-content .list { background-color:rgba(0,0,0,.3); height:100%; }
            .video-item { cursor:pointer; font-size:14px; line-height:35px; overflow:hidden; padding:0 10px; text-overflow:ellipsis; text-align:center; white-space:nowrap; color:#fff; }
            .video-item.active { background-color:rgba(0,0,0,.3); color:#0df; }
            .subtitle-setting-box { display:none; bottom:9px; left:auto; right:400px!important; }
        `;
        document.head.appendChild(style);
    };

    // ==================== 全局拦截与数据获取 ====================

    obj.setupXHRHook = function() {
        if (unsafeWindow._xhrHooked) return;
        unsafeWindow._xhrHooked = true;

        // 监听来自网页注入代码的拦截数据
        window.addEventListener("BaiduPan_XHR_Intercept", function(e) {
            var detail = e.detail;
            if (!detail || !detail.url || !detail.response) return;
            var responseURL = detail.url;
            console.log("[TTxiaohuang] 外层收到拦截数据:", responseURL);
            
            if (responseURL.indexOf("/api/filemetas") >= 0) {
                try {
                    var response = JSON.parse(detail.response);
                    console.log("[TTxiaohuang] 解析 filemetas 成功, 视频数:", response.info ? response.info.length : 0);
                    if (response.info && response.info.length > 0) {
                        if (response.info.length == 1 && obj.video_page.info.length == 0) {
                            obj.video_page.info[0] = response.info[0];
                            obj.triggerPlayInit(response.info[0].resolution);
                        } else {
                            obj.video_page.categorylist = response.info;
                        }
                    }
                } catch(err) {}
            }
            if (responseURL.indexOf("/mbox/msg/mediainfo") >= 0) {
                try {
                    var response = JSON.parse(detail.response);
                    if (response && response.info) {
                        obj.video_page.adToken = response.adToken;
                        var getParam = obj.require("base:widget/tools/service/tools.url.js").getParam;
                        obj.video_page.info[0] = {
                            from_uk: getParam("from_uk"), to: getParam("to"), fs_id: getParam("fs_id"),
                            name: getParam("name") || "", type: getParam("type"), md5: getParam("md5"),
                            msg_id: getParam("msg_id"), path: decodeURIComponent(decodeURIComponent(getParam("path")))
                        };
                        obj.triggerPlayInit(response.info.resolution);
                    }
                } catch(err) {}
            }
        });

        // 将拦截代码直接注入到网页前端，避免扩展沙盒导致的执行延迟
        var hookCode = `
            (function() {
                if (window._baiduPanXhrHooked) return;
                window._baiduPanXhrHooked = true;

                function sendToUserscript(url, responseText) {
                    window.dispatchEvent(new CustomEvent("BaiduPan_XHR_Intercept", {
                        detail: { url: url, response: responseText }
                    }));
                }

                var originalXhrOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url) {
                    this._url = url;
                    this.addEventListener("load", function() {
                        if (this.readyState === 4 && this.status === 200) {
                            var responseURL = this.responseURL || this._url || "";
                            if (responseURL.indexOf("/api/filemetas") >= 0 || responseURL.indexOf("/mbox/msg/mediainfo") >= 0) {
                                console.log("[TTxiaohuang] 底层抓到目标请求 (XHR):", responseURL);
                                var responseText = this.responseText || (typeof this.response === 'string' ? this.response : JSON.stringify(this.response));
                                sendToUserscript(responseURL, responseText);
                            }
                        }
                    });
                    return originalXhrOpen.apply(this, arguments);
                };

                var originalFetch = window.fetch;
                if (originalFetch) {
                    window.fetch = function() {
                        var fetchUrl = arguments[0];
                        var p = originalFetch.apply(this, arguments);
                        p.then(function(res) {
                            var responseURL = res.url || (typeof fetchUrl === 'string' ? fetchUrl : (fetchUrl && fetchUrl.url) || "");
                            if (responseURL.indexOf("/api/filemetas") >= 0 || responseURL.indexOf("/mbox/msg/mediainfo") >= 0) {
                                console.log("[TTxiaohuang] 底层抓到目标请求 (Fetch):", responseURL);
                                res.clone().text().then(function(text) {
                                    sendToUserscript(responseURL, text);
                                }).catch(function(){});
                            }
                        });
                        return p;
                    };
                }
            })();
        `;
        
        var scriptEl = document.createElement("script");
        scriptEl.textContent = hookCode;
        (document.head || document.documentElement || document.body).appendChild(scriptEl);
        scriptEl.remove();
    };

    obj.triggerPlayInit = function(resolution) {
        var file = obj.video_page.info[0];
        var vip = obj.getVip();
        var getUrl;
        
        if (obj.video_page.flag === 'playvideo' || obj.video_page.flag === 'pfilevideo') {
            getUrl = function(i) {
                return location.protocol + "//" + location.host + "/api/streaming?path=" + encodeURIComponent(file.path) + "&app_id=250528&clienttype=0&type=" + i + "&vip=" + vip + "&jsToken=" + unsafeWindow.jsToken;
            };
        } else if (obj.video_page.flag === 'mboxvideo') {
            getUrl = function(i) {
                return location.protocol + "//" + location.host + "/mbox/msg/streaming?from_uk=" + file.from_uk + "&to=" + file.to + "&msg_id=" + file.msg_id + "&fs_id=" + file.fs_id + "&type=" + file.type + "&stream_type=" + i;
            };
        }
        
        if (getUrl) {
            obj.getAdToken(getUrl("M3U8_AUTO_480"), function () {
                obj.addQuality(getUrl, resolution || file.resolution, vip);
                obj.useDPlayer();
            });
        }
    };

    // ==================== 文件列表管理 ====================

    obj.storageFileListSharePage = function () {
        try {
            var currentList = obj.require('system-core:context/context.js').instanceForSystem.list.getCurrentList();
            if (currentList.length) window.sessionStorage.setItem("sharePageFileList", JSON.stringify(currentList));
            else setTimeout(obj.storageFileListSharePage, 500);
        } catch (error) {}
        window.onhashchange = function () { setTimeout(obj.storageFileListSharePage, 500); };
        
        document.addEventListener('click', function(e) {
            if (e.target.closest('.fufHyA')) {
                setTimeout(obj.storageFileListSharePage, 500);
            }
        });
    };

    obj.fileForcePreviewSharePage = function () {
        document.addEventListener("click", function(e) {
            if (e.target.closest("#shareqr dd")) {
                try {
                    var selectedFile = obj.require('system-core:context/context.js').instanceForSystem.list.getSelected();
                    var file = selectedFile[0];
                    if (file.category == 1) {
                        var ext = file.server_filename.split(".").pop();
                        if (["ts"].includes(ext)) window.open("https://pan.baidu.com" + location.pathname + "?fid=" + file.fs_id, "_blank");
                    }
                } catch (error) {}
            }
        });
    };

    // ==================== 各页面播放入口 ====================

    obj.playSharePage = function () {
        unsafeWindow.locals.get("file_list", "sign", "timestamp", "share_uk", "shareid", function (file_list, sign, timestamp, share_uk, shareid) {
            if (file_list.length > 1 || file_list[0].mediaType != "video") {
                obj.storageFileListSharePage();
                obj.fileForcePreviewSharePage();
                return;
            }
            var file = obj.video_page.info[0] = file_list[0];
            var vip = obj.getVip();
            function getUrl(i) {
                return location.protocol + "//" + location.host + "/share/streaming?channel=chunlei&uk=" + share_uk + "&fid=" + file.fs_id + "&sign=" + sign + "&timestamp=" + timestamp + "&shareid=" + shareid + "&type=" + i + "&vip=" + vip + "&jsToken=" + unsafeWindow.jsToken;
            }
            obj.getAdToken(getUrl("M3U8_AUTO_480"), function () {
                obj.addQuality(getUrl, file.resolution, vip);
                obj.useDPlayer();
            });
        });
    };

    obj.getAdToken = function (url, callback) {
        var adToken = "";
        if (obj.video_page.flag !== "pfilevideo") {
            try {
                var module = obj.require("file-widget-1:videoPlay/Werbung/WerbungConfig.js");
                if (module && module.getAdToken) adToken = module.getAdToken();
            } catch (e) {}
        }
        if (obj.video_page.adToken || (obj.video_page.adToken = adToken) || obj.getVip() > 1) return callback && callback();
        
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 5000);
        fetch(url, { credentials: 'include', signal: controller.signal }).then(r => r.json()).then(n => {
            clearTimeout(timeoutId);
            if (133 === n.errno && 0 !== n.adTime) obj.video_page.adToken = n.adToken;
            callback && callback();
        }).catch(e => {
            clearTimeout(timeoutId);
            callback && callback();
        });
    };

    // ==================== 画质列表 ====================
    obj.addQuality = function (getUrl, resolution, vip) {
        obj.video_page.quality = [];
        var qualityNames = { 1080: "超清 1080P", 720: "高清 720P", 480: "流畅 480P", 360: "省流 360P" };
        var freeList = obj.freeList(resolution, vip);
        freeList.forEach(function (a) {
            obj.video_page.quality.push({
                name: qualityNames[a] + (a === 1080 ? " (SVIP)" : ""),
                url: getUrl("M3U8_AUTO_" + a) + "&isplayer=1&check_blue=1&adToken=" + encodeURIComponent(obj.video_page.adToken || ""),
                type: "hls"
            });
        });
    };

    obj.freeList = function (e, vip) {
        e = e || "";
        var t = [480, 360];
        var match = e.match(/width:(\d+),height:(\d+)/);
        var pixels = match ? +match[1] * +match[2] : 0;
        if (pixels > 409920) t.unshift(720);
        if (pixels > 921600 && vip > 1) t.unshift(1080);
        return t;
    };

    // ==================== 播放器创建 ====================
    obj.requireCdn = function (urls, callback) {
        var loaded = 0;
        var errors = 0;
        urls.forEach(function (url) {
            var script = document.createElement("script");
            script.src = url;
            script.onload = function () {
                if (++loaded + errors === urls.length) callback && callback();
            };
            script.onerror = function () {
                errors++;
                console.warn("[TTxiaohuang] CDN 加载失败:", url);
                if (loaded + errors === urls.length) callback && callback();
            };
            document.head.appendChild(script);
        });
    };

    obj.useDPlayer = function () { 
        if (window.DPlayer && window.Hls) {
            obj.dPlayerStart();
        } else {
            obj.requireCdn([
                "https://cdn.jsdelivr.net/npm/hls.js@1.6.16/dist/hls.min.js",
                "https://cdn.jsdelivr.net/npm/dplayer@1.27.1/dist/DPlayer.min.js"
            ], function () {
                obj.dPlayerStart();
            });
        }
    };

    obj.dPlayerStart = function () {
        var dPlayerNode, videoNode = document.getElementById("video-wrap") || document.querySelector(".vp-video__player");
        if (videoNode) {
            dPlayerNode = document.getElementById("dplayer");
            if (!dPlayerNode) {
                dPlayerNode = document.createElement("div");
                dPlayerNode.setAttribute("id", "dplayer");
                dPlayerNode.setAttribute("style", "width: 100%; height: 100%; background: #000;");
                obj.videoNode = videoNode.parentNode.replaceChild(dPlayerNode, videoNode);
                // 停止被替换掉的原始视频元素，防止脱离 DOM 后在内存中继续播放耗带宽
                if (obj.videoNode) {
                    try {
                        var oldVids = obj.videoNode.querySelectorAll('video');
                        if (!oldVids.length && obj.videoNode.tagName && obj.videoNode.tagName.toUpperCase() === 'VIDEO') oldVids = [obj.videoNode];
                        for (var oi = 0; oi < oldVids.length; oi++) {
                            try { oldVids[oi].pause(); oldVids[oi].removeAttribute('src'); oldVids[oi].load(); } catch(e2) {}
                        }
                    } catch(e) {}
                }
            }
        } else { return setTimeout(obj.dPlayerStart, 200); }

        if (obj._hls) { try { obj._hls.destroy(); } catch (e) {} obj._hls = null; }

        var quality = obj.video_page.quality;
        var defaultQuality = quality.findIndex(function (item) {
            return item.name.indexOf(localStorage.getItem("dplayer-quality")) === 0;
        });

        var savedVolume = parseFloat(localStorage.getItem("dplayer-volume"));
        if (!isFinite(savedVolume) || savedVolume < 0 || savedVolume > 1) savedVolume = 1.0;

        obj.injectCSS();

        var options = {
            container: dPlayerNode,
            video: {
                quality: quality,
                defaultQuality: defaultQuality < 0 ? 0 : defaultQuality,
                customType: {
                    hls: function (video, player) {
                        if (obj._hls) { try { obj._hls.destroy(); } catch (e) {} obj._hls = null; }

                        var hls = new window.Hls();
                        hls.loadSource(video.src);
                        hls.attachMedia(video);

                        hls.on(window.Hls.Events.MANIFEST_PARSED, function (event, data) {
                            var levels = data.levels;
                            if (levels && levels.length > 0) hls.currentLevel = levels.length - 1;
                        });

                        var recoverCount = 0;
                        hls.on(window.Hls.Events.FRAG_BUFFERED, function () { recoverCount = 0; });

                        hls.on(window.Hls.Events.ERROR, function (event, data) {
                            if (!data.fatal) return;
                            
                            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && data.response && data.response.code === 403) {
                                obj.msg("播放令牌过期，正在为您自动恢复...", "warning");
                                var sign = obj.video_page.info[0] ? (obj.video_page.info[0].md5 || obj.video_page.info[0].fs_id) : "";
                                if (sign) {
                                    localStorage.setItem("video_" + sign, video.currentTime);
                                }
                                setTimeout(function() { location.reload(); }, 1500);
                                return;
                            }

                            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && recoverCount < 5) {
                                recoverCount++;
                                hls.startLoad(video.currentTime || -1);
                            } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && recoverCount < 5) {
                                recoverCount++;
                                try { hls.recoverMediaError(); } catch (e) {}
                            } else {
                                obj.msg("播放出错，请尝试切换画质或刷新页面", "failure");
                            }
                        });
                        obj._hls = hls;
                    },
                },
                pic: obj.getPoster()
            },
            subtitle: {
                url: "", type: "webvtt",
                color: localStorage.getItem("dplayer-subtitle-color") || "#ffd821",
                bottom: (localStorage.getItem("dplayer-subtitle-bottom") || 10) + "%",
                fontSize: (localStorage.getItem("dplayer-subtitle-fontSize") || 5) + "vh"
            },
            contextmenu: [
                { text: '脚本作者主页', link: 'https://github.com/TTxiaohuang' },
                { text: '关于 DPlayer', link: 'https://dplayer.diygod.dev/' }
            ],
            autoplay: true, screenshot: true, hotkey: false,
            airplay: true, volume: savedVolume, theme: "#b7daff"
        };

        try {
            var player = new window.DPlayer(options);
            obj.playerInstance = player;
            obj.initPlayer(player);
            obj.resetPlayer();
            obj.msg("播放器创建成功");
        } catch (error) {
            console.error("[百度网盘播放器] 创建失败:", error);
            obj.msg("播放器创建失败: " + error.message, "failure");
        }
    };

    // ==================== 播放器初始化 ====================
    obj.initPlayer = function (player) {
        player.container.querySelectorAll(".dplayer-menu a").forEach(function(link) {
            if (link.textContent.indexOf("关于作者") !== -1) link.textContent = "关于播放器作者";
        });
        obj.playerReady(player, function (player) {
            var container = player.container;
            var nextSibling = container.nextElementSibling;
            while(nextSibling) {
                var toRemove = nextSibling;
                nextSibling = nextSibling.nextElementSibling;
                toRemove.remove();
            }
            if (location.pathname == "/mbox/streampage") container.style.height = "480px";

            obj.initPlayerEvents(player);
            obj.dPlayerSetting(player);
            obj.dPlayerCustomSpeed(player);
            obj.dPlayerSpeedBar(player);
            obj.dPlayerMemoryPlay(player);
            obj.dPlayerImageEnhancement(player);
            obj.gestureInit(player);
            obj.longPressInit(player);
            obj.dblclickInit(player);
            obj.dPlayerPip(player);
            obj.videoFit(player);
            obj.autoPlayEpisode();
            obj.dPlayerSubtitleSetting(player);
        });
    };

    obj.playerReady = function (player, callback) {
        if (player.isReady) { callback && callback(player); }
        else if (player.video.duration > 0 || player.video.readyState > 2) { player.isReady = true; callback && callback(player); }
        else {
            player.video.ondurationchange = function () {
                player.video.ondurationchange = null;
                player.isReady = true;
                callback && callback(player);
            };
        }
        setTimeout(function () {
            if (!player.isReady) {
                var reloadCount = parseInt(sessionStorage.getItem("startErrorCount") || "0", 10);
                if (reloadCount < 2) {
                    sessionStorage.setItem("startErrorCount", reloadCount + 1);
                    location.reload();
                } else {
                    sessionStorage.removeItem("startErrorCount");
                    obj.msg("播放器加载超时，请手动刷新页面", "failure");
                }
            } else { sessionStorage.removeItem("startErrorCount"); }
        }, 8000);
    };

    // ==================== 全局快捷键 ====================
    obj._globalKeydownHandler = function (e) {
        var player = obj.playerInstance;
        if (!player) return;
        var video = player.video;
        var activeEl = document.activeElement;
        if (activeEl) {
            var tag = activeEl.tagName.toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || activeEl.isContentEditable) return;
        }

        var handled = true;
        switch (e.keyCode || e.which) {
            case 32: player.toggle(); break;
            case 37: player.seek(Math.max(0, video.currentTime - 5)); break;
            case 39: player.seek(Math.min(video.duration || 0, video.currentTime + 5)); break;
            case 38: player.volume(Math.min(video.volume + 0.1, 1)); break;
            case 40: player.volume(Math.max(video.volume - 0.1, 0)); break;
            case 90: player.speed(1.0); player.notice("播放速度：1.0x"); break;
            case 88: var slow = Math.max(0.1, video.playbackRate - 0.1); player.speed(slow); player.notice("播放速度：" + slow.toFixed(1) + "x"); break;
            case 67: var fast = Math.min(16, video.playbackRate + 0.1); player.speed(fast); player.notice("播放速度：" + fast.toFixed(1) + "x"); break;
            default: handled = false;
        }
        if (handled) { e.preventDefault(); e.stopPropagation(); }
    };

    // ==================== 播放器事件 ====================
    obj.initPlayerEvents = function (player) {
        var _origSeek = player.seek.bind(player);
        player.seek = function (time) {
            try {
                var t = parseFloat(time);
                if (!isFinite(t)) return;
                var dur = player.video ? player.video.duration : NaN;
                if (isFinite(dur) && dur > 0) t = Math.max(0, Math.min(t, dur));
                return _origSeek(t);
            } catch (e) {}
        };

        document.addEventListener("keydown", obj._globalKeydownHandler, true);

        player.on("destroy", function () {
            if (obj._hls) { try { obj._hls.destroy(); } catch (e) {} obj._hls = null; }
            if (obj._visibilityChangeHandler) { document.removeEventListener("visibilitychange", obj._visibilityChangeHandler); obj._visibilityChangeHandler = null; }
            if (obj._beforeUnloadHandler) { window.removeEventListener("beforeunload", obj._beforeUnloadHandler); obj._beforeUnloadHandler = null; }
            if (obj._volumeChangeHandler) { player.video.removeEventListener("volumechange", obj._volumeChangeHandler); obj._volumeChangeHandler = null; }
            document.removeEventListener("keydown", obj._globalKeydownHandler, true);
        });

        var user = player.user;
        player.on("error", function () {
            var dur = player.video.duration;
            if (dur === 0 || dur === Infinity || isNaN(dur)) obj.msg("视频加载失败，请刷新页面重试", "failure");
        });

        player.on("ended", function () {
            if (user.get("autoplaynext")) {
                var nextIcon = document.querySelector(".next-icon");
                if (nextIcon) nextIcon.click();
            }
        });

        player.on("quality_end", function () {
            var rawName = player.quality.name.replace(" (SVIP)", "");
            localStorage.setItem("dplayer-quality", rawName);
        });

        obj._volumeChangeHandler = function () {
            var vol = player.video.volume;
            if (isFinite(vol)) localStorage.setItem("dplayer-volume", vol);
        };
        player.video.addEventListener("volumechange", obj._volumeChangeHandler);

        var headerEls = document.querySelectorAll("#layoutHeader, .header-box");
        
        if (localStorage.getItem("dplayer-isfullscreen") == "true") {
            try { player.fullScreen.request("web"); } catch (e) {}
            headerEls.forEach(el => el.style.display = "none");
        }

        player.on("webfullscreen", function () {
            headerEls.forEach(el => el.style.display = "none");
            localStorage.setItem("dplayer-isfullscreen", "true");
        });
        player.on("webfullscreen_cancel", function () {
            headerEls.forEach(el => el.style.display = "block");
            localStorage.setItem("dplayer-isfullscreen", "false");
        });

        player.on("fullscreen", function () {
            try { screen.orientation.lock("landscape"); } catch (e) {}
            localStorage.setItem("dplayer-isfullscreen", "true");
        });

        player.on("fullscreen_cancel", function () {
            try { screen.orientation.unlock(); } catch (e) {}
            localStorage.setItem("dplayer-isfullscreen", "false");
        });

        if (!obj._errorGuardInstalled) {
            obj._errorGuardInstalled = true;
            window.addEventListener('error', function (e) {
                var msg = e.message || '';
                if (msg.indexOf("Cannot read properties of null") !== -1 || msg.indexOf("NotSupportedError") !== -1 || msg.indexOf("not available") !== -1) { e.preventDefault(); return true; }
            });
            window.addEventListener('unhandledrejection', function (e) {
                var msg = (e.reason && e.reason.message) || String(e.reason || '');
                if (msg.indexOf("Cannot read properties of null") !== -1 || msg.indexOf("NotSupportedError") !== -1 || msg.indexOf("not available") !== -1) { e.preventDefault(); }
            });
        }
    };

    // ==================== 设置面板 ====================
    obj.dPlayerSetting = function (player) {
        if (document.querySelector(".dplayer-setting-autoposition")) return;

        var html = '<div class="dplayer-setting-item dplayer-setting-autoposition"><span class="dplayer-label">自动记忆播放</span><div class="dplayer-toggle"><input class="dplayer-toggle-setting-input-autoposition" type="checkbox" name="dplayer-toggle"><label for="dplayer-toggle"></label></div></div>';
        html += '<div class="dplayer-setting-item dplayer-setting-autoplaynext"><span class="dplayer-label">自动连续播放</span><div class="dplayer-toggle"><input class="dplayer-toggle-setting-input-autoplaynext" type="checkbox" name="dplayer-toggle"><label for="dplayer-toggle"></label></div></div>';
        html += '<div class="dplayer-setting-item dplayer-setting-imageenhancement"><span class="dplayer-label">画质增强</span><div class="dplayer-toggle"><input class="dplayer-toggle-setting-input-imageenhancement" type="checkbox" name="dplayer-toggle"><label for="dplayer-toggle"></label></div></div>';
        
        var originPanel = document.querySelector(".dplayer-setting-origin-panel");
        originPanel.insertAdjacentHTML('beforeend', html);

        var user = player.user;
        Object.assign(user.storageName, { autoposition: "dplayer-autoposition", autoplaynext: "dplayer-autoplaynext", imageenhancement: "dplayer-imageenhancement" });
        Object.assign(user.default, { autoposition: 0, autoplaynext: 0, imageenhancement: 0 });
        user.init();

        if (user.get("autoposition")) document.querySelector(".dplayer-toggle-setting-input-autoposition").checked = true;
        if (user.get("autoplaynext")) document.querySelector(".dplayer-toggle-setting-input-autoplaynext").checked = true;
        if (user.get("imageenhancement")) document.querySelector(".dplayer-toggle-setting-input-imageenhancement").checked = true;

        document.querySelector(".dplayer-setting-autoposition").addEventListener("click", function () {
            var toggle = document.querySelector(".dplayer-toggle-setting-input-autoposition");
            toggle.checked = !toggle.checked; user.set("autoposition", Number(toggle.checked));
        });
        document.querySelector(".dplayer-setting-autoplaynext").addEventListener("click", function () {
            var toggle = document.querySelector(".dplayer-toggle-setting-input-autoplaynext");
            toggle.checked = !toggle.checked; user.set("autoplaynext", Number(toggle.checked));
        });
        document.querySelector(".dplayer-setting-imageenhancement").addEventListener("click", function () {
            var toggle = document.querySelector(".dplayer-toggle-setting-input-imageenhancement");
            toggle.checked = !toggle.checked; user.set("imageenhancement", Number(toggle.checked));
            obj.dPlayerImageEnhancement(player);
        });
    };

    // ==================== 自定义倍速菜单 ====================
    obj.dPlayerCustomSpeed = function (player) {
        if (document.querySelector(".dplayer-setting-speed-item[data-speed='自定义']")) return;

        var localSpeed = parseFloat(localStorage.getItem("dplayer-speed"));
        if (isFinite(localSpeed) && localSpeed >= 0.1 && localSpeed <= 16) {
            player.video.playbackRate = localSpeed; 
        } else { localSpeed = null; }

        var speedPanel = document.querySelector(".dplayer-setting-speed-panel");
        speedPanel.insertAdjacentHTML('beforeend', '<div class="dplayer-setting-speed-item" data-speed="自定义"><span class="dplayer-label">自定义</span></div>');
        
        var settingEl = document.querySelector(".dplayer-setting");
        settingEl.insertAdjacentHTML('beforeend', '<div class="dplayer-setting-custom-speed"><div class="dplayer-speed-item"><span class="dplayer-speed-label" title="双击恢复正常速度">播放速度：</span><input class="dplayer-speed-input" type="number" step=".1" max="16" min=".1"></div></div>');

        var custombox = document.querySelector(".dplayer-setting-custom-speed");
        var input = document.querySelector(".dplayer-setting-custom-speed input");
        input.value = localSpeed || 1;

        input.addEventListener("input", function () {
            var val = parseFloat(input.value);
            if (isFinite(val) && val >= 0.1 && val <= 16) player.speed(val);
        });
        player.on("ratechange", function () {
            var playbackRate = player.video.playbackRate;
            localStorage.setItem("dplayer-speed", playbackRate);
            input.value = playbackRate;
            var icon = document.querySelector(".btn-select-speed .dplayer-icon");
            if(icon) icon.textContent = playbackRate + "x";
        });
        document.querySelector(".dplayer-speed-label").addEventListener("dblclick", function () {
            input.value = 1; player.speed(1);
        });

        document.querySelector(".dplayer-setting-speed-item[data-speed='自定义']").addEventListener("click", function () {
            var menuEl = document.querySelector(".dplayer .dplayer-menu");
            if (menuEl && menuEl.classList.contains("dplayer-menu-show")) { obj.msg("请关闭右键菜单后再操作"); return; }
            if (custombox.style.display === "block") {
                custombox.style.display = "none";
                player.setting.hide();
            } else {
                custombox.style.display = "block";
            }
        });
        
        Array.from(speedPanel.children).forEach(function(el) {
            if (el.getAttribute("data-speed") !== "自定义") {
                el.addEventListener("click", function() { custombox.style.display = "none"; });
            }
        });

        player.template.mask.addEventListener("click", function () { custombox.style.display = "none"; });
    };

    // ==================== 底部倍速工具栏 ====================
    obj.dPlayerSpeedBar = function (player) {
        if (document.querySelector(".dplayer-icons-right .btn-select-speed")) return;
        
        var currentSpeed = player.video.playbackRate || 1.0;
        var html = '<div class="dplayer-quality btn-select-speed"><button class="dplayer-icon dplayer-quality-icon" title="倍速 (Z/X/C键全局控制)">' + currentSpeed + 'x</button><div class="dplayer-quality-mask"><div class="dplayer-quality-list"><div class="dplayer-quality-item" data-speed="3.0">3.0x</div><div class="dplayer-quality-item" data-speed="2.0">2.0x</div><div class="dplayer-quality-item" data-speed="1.5">1.5x</div><div class="dplayer-quality-item" data-speed="1.25">1.25x</div><div class="dplayer-quality-item" data-speed="1.0">1.0x</div><div class="dplayer-quality-item" data-speed="0.5">0.5x</div></div></div></div>';
        
        document.querySelector(".dplayer-icons-right").insertAdjacentHTML('afterbegin', html);
        
        document.querySelectorAll(".btn-select-speed .dplayer-quality-item").forEach(function(item) {
            item.addEventListener("click", function () {
                var speed = parseFloat(this.getAttribute("data-speed"));
                if (isFinite(speed)) {
                    player.speed(speed);
                    player.notice("播放速度：" + speed.toFixed(1) + "x");
                }
            });
        });
    };

    // ==================== 记忆播放 ====================
    obj.dPlayerMemoryPlay = function (player) {
        if (obj.hasMemoryDisplay) return;
        obj.hasMemoryDisplay = true;

        var video = player.video;
        var file = obj.video_page.info[0] || {};
        var sign = file.md5 || file.fs_id;
        var memoryTime = getFilePosition(sign);

        if (memoryTime && isFinite(memoryTime) && memoryTime > 0) {
            var applyMemory = function() {
                var duration = video.duration;
                if (!isFinite(duration) || memoryTime >= duration - 10) return;
                
                var autoPosition = player.user.get("autoposition");
                if (autoPosition) {
                    player.seek(memoryTime);
                    player.play();
                } else {
                    var formatTime = formatVideoTime(memoryTime);
                    var memoryWrap = document.createElement("div");
                    memoryWrap.className = "memory-play-wrap";
                    memoryWrap.style.cssText = "display:block;position:absolute;left:30px;bottom:60px;font-size:15px;padding:7px;border-radius:3px;color:#fff;z-index:100;background:rgba(0,0,0,.5);";
                    memoryWrap.innerHTML = '上次播放到 ' + formatTime + '&nbsp;&nbsp;<a href="javascript:void(0);" class="play-jump" style="text-decoration:none;color:#0df;">跳转</a><em class="close-btn" style="display:inline-block;width:15px;height:15px;vertical-align:middle;cursor:pointer;background:url(https://nd-static.bdstatic.com/m-static/disk-share/widget/pageModule/share-file-main/fileType/video/img/video-flash-closebtn_15f0e97.png) no-repeat;margin-left:5px;"></em>';
                    player.container.appendChild(memoryWrap);

                    var memoryTimeout = setTimeout(function () { if(memoryWrap.parentNode) memoryWrap.parentNode.removeChild(memoryWrap); }, 15000);

                    memoryWrap.querySelector(".close-btn").onclick = function (e) {
                        e.stopPropagation();
                        if(memoryWrap.parentNode) memoryWrap.parentNode.removeChild(memoryWrap);
                        clearTimeout(memoryTimeout);
                    };

                    memoryWrap.querySelector(".play-jump").onclick = function (e) {
                        e.stopPropagation();
                        player.seek(memoryTime);
                        player.play();
                        if(memoryWrap.parentNode) memoryWrap.parentNode.removeChild(memoryWrap);
                        clearTimeout(memoryTimeout);
                    };
                }
            };
            if (video.duration) { applyMemory(); } else { player.on('loadedmetadata', applyMemory); }
        }

        obj._visibilityChangeHandler = function () {
            if (document.visibilityState === "hidden") {
                var ct = video.currentTime; var dur = video.duration;
                ct > 0 && isFinite(ct) && isFinite(dur) && setFilePosition(sign, ct, dur);
            }
        };
        obj._beforeUnloadHandler = function () {
            var ct = video.currentTime; var dur = video.duration;
            ct > 0 && isFinite(ct) && isFinite(dur) && setFilePosition(sign, ct, dur);
        };
        document.addEventListener("visibilitychange", obj._visibilityChangeHandler);
        window.addEventListener("beforeunload", obj._beforeUnloadHandler);

        function getFilePosition(e) {
            var val = parseFloat(localStorage.getItem("video_" + e));
            return isFinite(val) && val > 0 ? val : 0;
        }
        function setFilePosition(e, t, o) {
            if (!e || !isFinite(t) || t <= 0) return;
            if (!isFinite(o) || o <= 0) return;
            e = "video_" + e;
            if (t <= 60 || t + 60 >= o) localStorage.removeItem(e);
            else localStorage.setItem(e, t);
        }
        function formatVideoTime(seconds) {
            var s = Math.round(seconds);
            var h = Math.floor(s / 3600);
            var m = Math.floor((s - h * 3600) / 60);
            var sec = s - h * 3600 - m * 60;
            m < 10 && (m = "0" + m); sec < 10 && (sec = "0" + sec);
            return h === 0 ? m + ":" + sec : h + ":" + m + ":" + sec;
        }
    };

    // ==================== 画质增强 ====================
    obj.dPlayerImageEnhancement = function (player) {
        player.user.get("imageenhancement")
            ? player.video.style.filter = "contrast(1.01) brightness(1.05) saturate(1.1)"
            : player.video.style.filter = "";
    };

    // ==================== 移动端手势 ====================
    obj.gestureInit = function (player) {
        if (!/Mobi|Android|iPhone/i.test(navigator.userAgent)) return;
        var video = player.template.video;
        var videoWrap = player.template.videoWrap;
        var playedBarWrap = player.template.playedBarWrap;
        var isDragging = false, startX = 0, startY = 0, startCurrentTime = 0, startVolume = 0, startBrightness = "100%", lastDirection = 0;

        function clamp(num, a, b) { return Math.max(Math.min(num, Math.max(a, b)), Math.min(a, b)); }
        function getDirection(sx, sy, ex, ey) {
            var ax = ex - sx, ay = ey - sy;
            if (Math.abs(ax) < 2 && Math.abs(ay) < 2) return 0;
            var angle = Math.atan2(ay, ax) * 180 / Math.PI;
            if (angle >= -135 && angle <= -45) return 1;
            if (angle > 45 && angle < 135) return 2;
            if ((angle >= 135 && angle <= 180) || (angle >= -180 && angle < -135)) return 3;
            if (angle >= -45 && angle <= 45) return 4;
            return 0;
        }

        var onTouchStart = function (event) {
            if (event.touches.length === 1) {
                isDragging = true; startX = event.touches[0].clientX; startY = event.touches[0].clientY;
                startCurrentTime = video.currentTime; startVolume = video.volume;
                startBrightness = (/brightness\((\d+%?)\)/.exec(video.style.filter) || [])[1] || "100%";
            }
        };
        var onTouchMove = function (event) {
            if (event.touches.length !== 1 || !isDragging) return;
            var cx = event.touches[0].clientX, cy = event.touches[0].clientY;
            var isRotate = player.isRotate; var client = isRotate ? cy : cx;
            var rect = video.getBoundingClientRect();
            var ratioX = clamp((cx - startX) / rect.width, -1, 1);
            var ratioY = clamp((cy - startY) / rect.height, -1, 1);
            var ratio = isRotate ? ratioY : ratioX;
            var direction = getDirection(startX, startY, cx, cy);
            if (direction != lastDirection) { lastDirection = direction; return; }
            if (direction == 1 || direction == 2) {
                if (!lastDirection) lastDirection = direction;
                if (lastDirection > 2) return;
                var middle = isRotate ? rect.height / 2 : rect.width / 2;
                if (client < middle) {
                    var brightness = clamp(+((/\d+/.exec(startBrightness) || [])[0] || 100) + 200 * ratio * 10, 50, 200);
                    video.style.cssText += "filter: brightness(" + brightness.toFixed(0) + "%)";
                    player.notice("亮度调节 " + brightness.toFixed(0) + "%");
                } else { player.volume(clamp(startVolume + ratio * 10, 0, 1)); }
            } else if (direction == 3 || direction == 4) {
                if (!lastDirection) lastDirection = direction;
                if (lastDirection < 3) return;
                player.seek(clamp(startCurrentTime + video.duration * ratio * 0.5, 0, video.duration));
            }
        };
        var onTouchEnd = function () { if (isDragging) { isDragging = false; lastDirection = 0; } };

        videoWrap.addEventListener('touchstart', onTouchStart); playedBarWrap.addEventListener('touchstart', onTouchStart);
        videoWrap.addEventListener('touchmove', onTouchMove); playedBarWrap.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);

        window.addEventListener("onorientationchange" in window ? "orientationchange" : "resize", function () {
            if (window.orientation === 180 || window.orientation === 0) player.isRotate = true;
            else if (window.orientation === 90 || window.orientation === -90) player.isRotate = false;
        }, false);
    };

    // ==================== 长按 3 倍速 ====================
    obj.longPressInit = function (player) {
        var video = player.template.video;
        var isDragging = false, isLongPress = false, timer = 0, speed = 1;

        var onMouseDown = function () {
            timer = setTimeout(function () {
                isLongPress = true; speed = video.playbackRate; player.speed(speed * 3);
            }, 1000);
        };
        var onMouseUp = function () {
            clearTimeout(timer);
            setTimeout(function () { if (isLongPress) { isLongPress = false; player.speed(speed); player.play(); } });
        };
        var onMouseLeave = function () {
            clearTimeout(timer);
            if (isLongPress) { isLongPress = false; player.speed(speed); player.play(); }
        };
        var onTouchStart = function (event) {
            if (event.touches.length === 1) {
                isDragging = true; speed = video.playbackRate;
                timer = setTimeout(function () {
                    isLongPress = true; player.speed(speed * 3); player.contextmenu.hide();
                }, 1000);
            }
        };
        var onTouchMove = function () {
            if (isDragging) {
                clearTimeout(timer);
                if (isLongPress) { isLongPress = false; player.speed(speed); player.play(); }
            }
        };
        var onTouchEnd = function () {
            if (isDragging) {
                isDragging = false; clearTimeout(timer);
                setTimeout(function () { if (isLongPress) { isLongPress = false; player.speed(speed); player.play(); } });
            }
        };

        video.addEventListener('touchstart', onTouchStart); video.addEventListener('touchmove', onTouchMove);
        video.addEventListener('touchend', onTouchEnd); video.addEventListener('mousedown', onMouseDown);
        video.addEventListener('mouseup', onMouseUp); video.addEventListener('mouseleave', onMouseLeave);
    };

    // ==================== 双击快进快退 ====================
    obj.dblclickInit = function (player) {
        var video = player.template.video;
        video.addEventListener('dblclick', function (event) {
            event.preventDefault(); event.stopPropagation();
            var currentTime = video.currentTime;
            var rect = video.getBoundingClientRect();
            var clickX = event.clientX - rect.left;
            if (clickX < rect.width / 2) player.seek(currentTime - 30);
            else player.seek(currentTime + 30);
        }, true);
    };

    // ==================== 画中画 ====================
    obj.dPlayerPip = function (player) {
        if (document.querySelector(".dplayer-icons-right .dplayer-pip-btn")) return;
        document.querySelector(".dplayer-setting").insertAdjacentHTML('beforebegin', '<div class="dplayer-pip-btn"><button class="dplayer-icon dplayer-pip-icon" data-balloon="画中画" data-balloon-pos="up"><span class="dplayer-icon-content"><svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 32 32"><path d="M2.667 2.667h18.667v18.667h-18.667v-18.667M29.333 10.667v18.667h-18.667v-5.333h2.667v2.667h13.333v-13.333h-2.667v-2.667h5.333z"></path></svg></span></button></div>');

        var video = player.template.video;
        document.querySelector(".dplayer-pip-btn button").addEventListener("click", function () {
            var btnContent = this.querySelector(".dplayer-icon-content");
            if (document.pictureInPictureEnabled) {
                if (document.pictureInPictureElement) {
                    document.exitPictureInPicture().then(function () { btnContent.style.opacity = ""; }).catch(function (err) { player.notice(err); });
                } else {
                    video.requestPictureInPicture().then(function () {
                        btnContent.style.opacity = "0.4";
                        video.onleavepictureinpicture = function () {
                            video.onleavepictureinpicture = null;
                            btnContent.style.opacity = "";
                        };
                    }).catch(function (err) { player.notice(err); });
                }
            } else { player.notice("画中画模式不可用"); }
        });
    };

    // ==================== 画面模式 ====================
    obj.videoFit = function (player) {
        if (document.querySelector(".dplayer-icons-right .btn-select-fit")) return;
        var html = '<div class="dplayer-quality btn-select-fit"><button class="dplayer-icon dplayer-quality-icon">画面模式</button><div class="dplayer-quality-mask"><div class="dplayer-quality-list"><div class="dplayer-quality-item" data-index="0">原始比例</div><div class="dplayer-quality-item" data-index="1">自动裁剪</div><div class="dplayer-quality-item" data-index="2">拉伸填充</div><div class="dplayer-quality-item" data-index="3">系统默认</div></div></div></div>';
        document.querySelector(".dplayer-icons-right").insertAdjacentHTML('afterbegin', html);
        
        document.querySelectorAll(".btn-select-fit .dplayer-quality-item").forEach(function(item) {
            item.addEventListener("click", function () {
                var vfit = ["none", "cover", "fill", ""][this.getAttribute("data-index")];
                player.video.style["object-fit"] = vfit;
                document.querySelector(".btn-select-fit .dplayer-icon").textContent = this.textContent;
            });
        });
    };

    // ==================== 选集 ====================
    obj.autoPlayEpisode = function () {
        if (document.querySelector(".dplayer-icons-right #btn-select-episode")) return;
        var flag = obj.video_page.flag;
        if (flag == "sharevideo") obj.selectEpisodeSharePage();
        else if (flag == "playvideo") obj.selectEpisodeHomePage();
        else if (flag == "pfilevideo") obj.selectEpisodePfilePage();
    };

    obj.selectEpisodeSharePage = function () {
        var fileList = JSON.parse(sessionStorage.getItem("sharePageFileList") || "[]");
        var videoList = fileList.filter(function (item) { return item.category == 1; });
        var file = obj.video_page.info[0];
        var fileIndex = videoList.findIndex(function (item) { return item.fs_id == file.fs_id; });
        if (fileIndex > -1 && videoList.length > 1) obj.createEpisodeElement(videoList, fileIndex);
    };

    obj.selectEpisodeHomePage = function () {
        var videoList = [];
        document.querySelectorAll("#videoListView .video-item").forEach(function (el) { videoList.push({ server_filename: el.title }); });
        var currpath = obj.require("system-core:context/context.js").instanceForSystem.router.query.get("path");
        var server_filename = currpath.split("/").pop();
        var fileIndex = videoList.findIndex(function (item) { return item.server_filename == server_filename; });
        if (fileIndex > -1 && videoList.length > 1) obj.createEpisodeElement(videoList, fileIndex);
    };

    obj.selectEpisodePfilePage = function () {
        var videoList = obj.video_page.categorylist;
        if (videoList.length > 1) {
            var server_filename = obj.video_page.info[0].server_filename;
            var fileIndex = videoList.findIndex(function (item) { return item.server_filename == server_filename; });
            if (fileIndex > -1) obj.createEpisodeElement(videoList, fileIndex);
        }
    };

    obj.createEpisodeElement = function (videoList, fileIndex) {
        var eleitem = "";
        videoList.forEach(function (item, index) {
            var active = fileIndex == index;
            var safeFilename = obj.escapeHtml(item.server_filename);
            eleitem += '<div class="video-item' + (active ? ' active' : '') + '" title="' + safeFilename + '">' + safeFilename + '</div>';
        });

        var html = '<button class="dplayer-icon dplayer-play-icon prev-icon" title="上一集"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="128" height="128"><path d="M757.5 190.1L382.5 490.1a28 28 0 000 43.8l375 300a28 28 0 0045.5-21.9V212a28 28 0 00-45.5-21.9zM250 221.5a28 28 0 00-28 28v525a28 28 0 1056 0V249.5a28 28 0 00-28-28z" fill="#333"/></svg></button>';
        html += '<button id="btn-select-episode" class="dplayer-icon dplayer-quality-icon" title="选集">选集</button>';
        html += '<div class="playlist-content"><div class="list">' + eleitem + '</div></div>';
        html += '<button class="dplayer-icon dplayer-play-icon next-icon" title="下一集"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="128" height="128"><path d="M248.5 190.1l375 300a28 28 0 010 43.8l-375 300a28 28 0 01-45.5-21.9V212c0-23.5 27.2-36.5 45.5-21.9zm507.5 31.4a28 28 0 0128 28v525a28 28 0 11-56 0V249.5a28 28 0 0128-28z" fill="#333"/></svg></button>';

        document.querySelector(".dplayer-icons-right").insertAdjacentHTML('afterbegin', html);

        document.querySelector("#btn-select-episode").addEventListener("click", function () {
            var eleEpisode = document.querySelector(".playlist-content");
            if (eleEpisode.style.transform === "scale(1)") { 
                eleEpisode.style.transform = "scale(0)"; 
            } else {
                eleEpisode.style.transform = "scale(1)";
                document.querySelector(".dplayer-mask").classList.add("dplayer-mask-show");
                var singleHeight = document.querySelector(".playlist-content .video-item").offsetHeight;
                var totalHeight = eleEpisode.clientHeight;
                eleEpisode.scrollTop = (fileIndex + 1) * singleHeight - totalHeight / 2;
            }
        });

        document.querySelector(".dplayer-mask").addEventListener("click", function () {
            var eleEpisode = document.querySelector(".playlist-content");
            if (eleEpisode && eleEpisode.style.transform === "scale(1)") { 
                eleEpisode.style.transform = "scale(0)"; 
                this.classList.remove("dplayer-mask-show"); 
            }
        });

        document.querySelectorAll(".playlist-content .video-item").forEach(function(item, idx) {
            item.addEventListener("click", function () {
                if (this.classList.contains("active")) return;
                document.querySelector(".dplayer-mask").classList.remove("dplayer-mask-show");
                var activeItem = document.querySelector(".video-item.active");
                if (activeItem) activeItem.classList.remove("active");
                this.classList.add("active");
                newPage(videoList[idx], idx);
            });
        });

        document.querySelector(".prev-icon").addEventListener("click", function () { var prev = videoList[--fileIndex]; prev ? newPage(prev, fileIndex) : (++fileIndex, obj.msg("没有上一集了", "failure")); });
        document.querySelector(".next-icon").addEventListener("click", function () { var next = videoList[++fileIndex]; next ? newPage(next, fileIndex) : (--fileIndex, obj.msg("没有下一集了", "failure")); });

        function newPage(currvideo, t) {
            var flag = obj.video_page.flag;
            if (flag == "sharevideo") {
                location.href = "https://pan.baidu.com" + location.pathname + "?fid=" + currvideo.fs_id;
            } else if (flag == "playvideo") {
                var currpath = obj.require("system-core:context/context.js").instanceForSystem.router.query.get("path");
                var path = currpath.split("/").slice(0, -1).concat(currvideo.server_filename).join("/");
                location.href = location.origin + location.pathname + "?_=" + Date.now() + "#/video?path=" + encodeURIComponent(path) + "&t=" + (t || 0);
            } else if (flag == "pfilevideo") {
                location.href = "https://pan.baidu.com/pfile/video?path=" + encodeURIComponent(currvideo.path);
            }
        }
    };

    // ==================== 字幕 ====================
    obj.dPlayerSubtitleSetting = function (player) {
        if (document.querySelector(".dplayer-setting-subtitle") && document.querySelector(".subtitle-setting-box")) return;
        document.querySelector(".dplayer-setting-origin-panel").insertAdjacentHTML('beforeend', '<div class="dplayer-setting-item dplayer-setting-subtitle"><span class="dplayer-label">字幕设置</span><div class="dplayer-toggle"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M22 16l-10.1-10.6-1.9 2 8.2 8.6-8.2 8.6 1.9 2 8.2-8.6z"/></svg></div></div>');
        
        document.querySelector(".dplayer-setting-subtitle").addEventListener("click", function () { 
            var box = document.querySelector(".subtitle-setting-box");
            box.style.display = box.style.display === "none" ? "block" : "none"; 
            if (!obj._subtitlesLoaded) {
                obj._subtitlesLoaded = true;
                obj.loadSubtitlesAndPopulateList(player);
            }
        });
        document.querySelector(".dplayer-mask").addEventListener("click", function () { 
            var box = document.querySelector(".subtitle-setting-box");
            if (box) box.style.display = "none"; 
        });

        var html = '<div class="dplayer-icons dplayer-comment-box subtitle-setting-box"><div class="dplayer-comment-setting-box dplayer-comment-setting-open">';
        html += '<div class="dplayer-comment-setting-color"><div class="dplayer-comment-setting-title">字幕颜色</div>';
        ["#fff", "#e54256", "#ffe133", "#64DD17", "#39ccff", "#D500F9"].forEach(function (c) { html += '<label><input type="radio" name="dplayer-danmaku-color-1" value="' + c + '"' + (c === "#fff" ? ' checked' : '') + '><span style="background:' + c + ';"></span></label>'; });
        html += '</div>';
        html += '<div class="dplayer-comment-setting-type"><div class="dplayer-comment-setting-title">字幕位置</div><label><input type="radio" name="dplayer-danmaku-pos" value="1"><span>上移</span></label><label><input type="radio" name="dplayer-danmaku-pos" value="0" checked><span>默认</span></label><label><input type="radio" name="dplayer-danmaku-pos" value="2"><span>下移</span></label></div>';
        html += '<div class="dplayer-comment-setting-type"><div class="dplayer-comment-setting-title">字幕大小</div><label><input type="radio" name="dplayer-danmaku-size" value="1"><span>加大</span></label><label><input type="radio" name="dplayer-danmaku-size" value="0"><span>默认</span></label><label><input type="radio" name="dplayer-danmaku-size" value="2"><span>减小</span></label></div>';
        html += '<div class="dplayer-comment-setting-type"><div class="dplayer-comment-setting-title">本地字幕</div><label><input type="radio" name="dplayer-danmaku-local" value="1"><span>导入文件</span></label></div>';
        html += '</div></div>';
        document.querySelector(".dplayer-controller").insertAdjacentHTML('beforeend', html);

        document.querySelectorAll(".subtitle-setting-box .dplayer-comment-setting-color input[type='radio']").forEach(function(item) {
            item.addEventListener("click", function () {
                localStorage.setItem("dplayer-subtitle-color", this.value); 
                document.querySelector(".dplayer-subtitle").style.color = this.value;
            });
        });
        document.querySelectorAll(".subtitle-setting-box .dplayer-comment-setting-type input[type='radio']").forEach(function(item) {
            item.addEventListener("click", function () {
                var value = this.value; var name = this.closest(".dplayer-comment-setting-type").querySelector(".dplayer-comment-setting-title").textContent;
                if (name == "字幕位置") {
                    var bottom = Number(localStorage.getItem("dplayer-subtitle-bottom") || 10);
                    value == "1" ? bottom += 1 : value == "2" ? bottom -= 1 : bottom = 10;
                    localStorage.setItem("dplayer-subtitle-bottom", bottom); document.querySelector(".dplayer-subtitle").style.bottom = bottom + "%";
                } else if (name == "字幕大小") {
                    var fontSize = Number(localStorage.getItem("dplayer-subtitle-fontSize") || 5);
                    value == "1" ? fontSize += 0.1 : value == "2" ? fontSize -= 0.1 : fontSize = 5;
                    localStorage.setItem("dplayer-subtitle-fontSize", fontSize); document.querySelector(".dplayer-subtitle").style.fontSize = fontSize + "vh";
                } else if (name == "本地字幕") {
                    if (value == "1") {
                        if (!document.querySelector("#addsubtitle")) document.body.insertAdjacentHTML('beforeend', '<input id="addsubtitle" type="file" accept=".vtt,.srt,.ssa,.ass" style="display:none;">');
                        document.querySelector("#addsubtitle").click();
                        obj.localFileRequest(player);
                    }
                }
            });
        });
    };

    obj.loadSubtitlesAndPopulateList = function(player) {
        obj.msg("正在请求字幕列表...");
        obj.getSubList(function (sublist) {
            if (!Array.isArray(sublist) || !sublist.length) {
                obj.msg("当前视频未发现字幕", "warning");
                return;
            }
            var video = player.video; var textTracks = video.textTracks;
            for (var i = 0; i < textTracks.length; i++) {
                textTracks[i].mode = "hidden";
                if (textTracks[i].cues && textTracks[i].cues.length) {
                    for (var ii = textTracks[i].cues.length - 1; ii >= 0; ii--) textTracks[i].removeCue(textTracks[i].cues[ii]);
                }
            }
            sublist.forEach(function (item, index) {
                if (!Array.isArray(item?.sarr)) return;
                item.language || (item.language = obj.langDetectSarr(item.sarr));
                item.label || (item.label = obj.langCodeTransform(item.language));
                textTracks[index] || video.addTextTrack("subtitles", item.label, item.language);
                item.sarr.forEach(function (cue) {
                    if (!/<b>.*<\/b>/.test(cue.text)) cue.text = cue.text.split(/\r?\n/).map(function (l) { return '<b>' + l + '</b>'; }).join("\n");
                    var vttCue = new VTTCue(cue.startTime, cue.endTime, cue.text); vttCue.id = cue.index;
                    textTracks[index] && textTracks[index].addCue(vttCue);
                });
            });
            var textTrack = textTracks[0];
            if (textTrack && textTrack.cues && textTrack.cues.length) { 
                textTrack.mode = "showing"; 
                obj.msg("字幕加载成功"); 
                obj.selectSubtitles(textTracks);
                player.subtitle.container.style.textShadow = "1px 0 1px #000, 0 1px 1px #000, -1px 0 1px #000, 0 -1px 1px #000";
                player.subtitle.container.style.fontFamily = "黑体, Trajan, serif";
            }
        });
    };

    obj.selectSubtitles = function (textTracks) {
        if (textTracks.length <= 1) return;
        var subMask = document.querySelector(".dplayer-subtitle-btn .dplayer-quality-mask");
        if (subMask) subMask.remove();
        var subbtn = document.querySelector(".dplayer-subtitle-btn");
        subbtn.classList.add("dplayer-quality");
        var sublist = obj.video_page.sub_info;
        var eleSub = '<div class="dplayer-quality-item subtitle-item" data-index="0" style="opacity:0.4;">默认字幕</div>';
        for (var i = 1; i < sublist.length; i++) { eleSub += '<div class="dplayer-quality-item subtitle-item" data-index="' + i + '">' + sublist[i].label + '</div>'; }
        subbtn.insertAdjacentHTML('beforeend', '<div class="dplayer-quality-mask"><div class="dplayer-quality-list subtitle-select">' + eleSub + '</div></div>');
        
        document.querySelectorAll(".subtitle-select .subtitle-item").forEach(function(item) {
            item.addEventListener("click", function () {
                var index = this.getAttribute("data-index");
                if (this.style.opacity == 0.4) return;
                Array.from(this.parentNode.children).forEach(el => el.style.opacity = "");
                this.style.opacity = "0.4";
                var subitem = sublist[index];
                if (subitem && subitem.sarr && subitem.sarr.length) {
                    for (var i = textTracks[0].cues.length - 1; i >= 0; i--) textTracks[0].removeCue(textTracks[0].cues[i]);
                    subitem.sarr.forEach(function (cue) {
                        if (!/<b>.*<\/b>/.test(cue.text)) cue.text = cue.text.split(/\r?\n/).map(function (l) { return '<b>' + l + '</b>'; }).join("\n");
                        var vttCue = new VTTCue(cue.startTime, cue.endTime, cue.text); vttCue.id = cue.index;
                        textTracks[0].addCue(vttCue);
                    });
                }
            });
        });
    };

    // ==================== 字幕获取与解析 ====================
    obj.getSubList = function (callback) {
        var file = obj.video_page.info[0];
        var currSubList = JSON.parse(sessionStorage.getItem("subtitle_" + file.fs_id) || "[]");
        if (currSubList && currSubList.length) {
            obj.video_page.sub_info = currSubList; 
            callback && callback(currSubList);
            return;
        }
        obj.aiSubtitle(function (sublist) {
            if (Array.isArray(sublist) && sublist.length) {
                currSubList = currSubList.concat(sublist);
                currSubList = obj.video_page.sub_info = obj.sortSubList(currSubList);
                sessionStorage.setItem("subtitle_" + file.fs_id, JSON.stringify(currSubList));
                callback && callback(currSubList);
            } else { callback && callback(""); }
        });
    };

    obj.aiSubtitle = function (callback) {
        obj.getSubtitleListAI(function (sublist) {
            if (!Array.isArray(sublist) || !sublist.length) return callback && callback("");
            var remaining = sublist.length;
            sublist.forEach(function (item) {
                obj.getSubtitleDataAI(item.uri, function (stext) {
                    var sarr = obj.subtitleParser(stext, "vtt");
                    if (Array.isArray(sarr)) { item.sarr = sarr; item.language = obj.langDetectSarr(sarr); item.label = item.text; }
                    if (!--remaining) callback && callback(sublist.filter(function (i) { return i.sarr; }));
                });
            });
        });
    };

    obj.getSubtitleListAI = function (callback) {
        var vip = obj.getVip();
        var url = obj.video_page.flag == "pfilevideo" ? "https://pan.baidu.com/api/streaming?path=" + encodeURIComponent(decodeURIComponent(obj.getParam("path"))) + "&app_id=250528&clienttype=0&type=M3U8_SUBTITLE_SRT&vip=" + vip + "&jsToken=" + unsafeWindow.jsToken : obj.require("file-widget-1:videoPlay/context.js").getContext().param.getUrl("M3U8_SUBTITLE_SRT");
        vip > 1 || (url += "&check_blue=1&isplayer=1&adToken=" + encodeURIComponent(obj.video_page.adToken));
        fetch(url).then(r => r.text()).then(text => {
            var lines = text.split("\n"); var result = [];
            try {
                for (var s = 2; s < lines.length; s += 2) {
                    var line = lines[s] || "";
                    if (line.indexOf("#EXT-X-MEDIA:") !== -1) {
                        var parts = line.replace("#EXT-X-MEDIA:", "").split(","); var obj2 = {};
                        for (var l = 0; l < parts.length; l++) { var p = parts[l].split("="); obj2[(p[0] || "").toLowerCase().replace("-", "_")] = String(p[1]).replace(/"/g, ""); }
                        obj2.uri = lines[s + 1]; result.push(obj2);
                    }
                }
            } catch (e) {} callback && callback(result);
        }).catch(() => callback && callback(""));
    };

    obj.getSubtitleDataAI = function (url, callback) {
        fetch(url).then(r => r.text()).then(t => callback && callback(t)).catch(() => callback && callback(""));
    };

    obj.localFileRequest = function (player) {
        var input = document.querySelector("#addsubtitle");
        input.onchange = function (event) {
            if (!this.files.length) return;
            var file = this.files[0]; var ext = file.name.split(".").pop().toLowerCase();
            if (!["webvtt", "vtt", "srt", "ssa", "ass"].includes(ext)) { obj.msg("暂不支持此类型文件", "failure"); return; }
            var reader = new FileReader();
            reader.readAsText(file, 'UTF-8');
            reader.onload = function () {
                var result = reader.result;
                if (result.indexOf("\uFFFD") > -1) return reader.readAsText(file, "GB18030");
                if (result.indexOf("") > -1) return reader.readAsText(file, "BIG5");
                var sarr = obj.subtitleParser(result, ext);
                if (Array.isArray(sarr) && sarr.length) { 
                    var item = { sarr: sarr, language: obj.langDetectSarr(sarr) };
                    item.label = "本地加载 - " + obj.langCodeTransform(item.language);
                    var currSubList = obj.video_page.sub_info || [];
                    currSubList.push(item);
                    obj.video_page.sub_info = currSubList;
                    obj.msg("本地字幕加载成功");
                    obj._subtitlesLoaded = false;
                    document.querySelector(".dplayer-setting-subtitle").click();
                } else {
                    obj.msg("字幕解析失败", "failure");
                }
            };
            this.value = event.target.value = "";
        };
    };

    obj.subtitleParser = function (stext, sext) {
        if (!stext) return "";
        sext || (sext = stext.indexOf("->") > 0 ? "srt" : stext.indexOf("Dialogue:") > 0 ? "ass" : "");
        sext = sext.toLowerCase(); var items = [];
        if (sext === "webvtt" || sext === "vtt" || sext === "srt") {
            stext = stext.replace(/\r/g, "");
            var regex = /(\d+)?\n?(\d{0,2}:?\d{2}:\d{2}.\d{3}) -?--> (\d{0,2}:?\d{2}:\d{2}.\d{3})/g;
            var data = stext.split(regex); data.shift();
            for (var i = 0; i < data.length; i += 4) {
                items.push({ index: items.length, startTime: obj.parseTimestamp(data[i + 1]), endTime: obj.parseTimestamp(data[i + 2]), text: data[i + 3].trim().replace(/{.*?}/g, "").replace(/[a-z]+\:.*\d+\.\d+\%\s/, "") });
            }
            return items;
        } else if (sext === "ssa" || sext === "ass") {
            stext = stext.replace(/\r\n/g, "");
            var regex2 = /Dialogue: .*?\d+,(\d+:\d{2}:\d{2}\.\d{2}),(\d+:\d{2}:\d{2}\.\d{2}),.*?,\d+,\d+,\d+,.*?,/g;
            var data2 = stext.split(regex2); data2.shift();
            for (var j = 0; j < data2.length; j += 3) {
                items.push({ index: items.length, startTime: obj.parseTimestamp(data2[j]), endTime: obj.parseTimestamp(data2[j + 1]), text: data2[j + 2].trim().replace(/\\N/g, "\n").replace(/{.*?}/g, "") });
            }
            return items;
        }
        return "";
    };

    obj.parseTimestamp = function (e) {
        var t = e.split(":"); var sec = parseFloat(t.length > 0 ? t.pop().replace(/,/g, ".") : "00.000") || 0;
        var min = parseFloat(t.length > 0 ? t.pop() : "00") || 0;
        return 3600 * (parseFloat(t.length > 0 ? t.pop() : "00") || 0) + 60 * min + sec;
    };

    obj.langDetectSarr = function (sarr) {
        var sample = [sarr[parseInt(sarr.length / 3)].text, sarr[parseInt(sarr.length / 2)].text, sarr[parseInt(sarr.length / 3 * 2)].text].join("").replace(/[<bi\/>\r?\n]*/g, "");
        var lang = "eng"; var cnRatio = (sample.match(/[一-龥]/g) || []).length / sample.length; var jpRatio = (sample.match(/[〠-〿]|[぀-ゟ]|[゠-ヿ]|[ㇰ-ㇿ]/g) || []).length / sample.length;
        if (jpRatio > 0.03) lang = "jpn"; else if (cnRatio > 0.1) lang = "chi"; return lang;
    };

    obj.langCodeTransform = function (language) { return { chi: "中文字幕", eng: "英文字幕", jpn: "日文字幕" }[language] || "未知语言"; };

    obj.sortSubList = function (sublist) {
        var chlist = [], otherlist = [];
        sublist.forEach(function (item) { (["chi", "zho"].includes(item.language) ? chlist : otherlist).push(item); });
        return chlist.concat(otherlist);
    };

    // ==================== 销毁原版播放器 ====================
    obj.resetPlayer = function () {
        obj.async("file-widget-1:videoPlay/context.js", function (c) {
            var count = 0;
            var checkAndDestroy = function() {
                var playerInstance = c ? c.getContext()?.playerInstance : obj.videoNode && obj.videoNode.firstChild;
                if (playerInstance && playerInstance.player) {
                    try { playerInstance.player.dispose(); } catch (e) { console.warn("[百度网盘播放器] 销毁原版播放器失败:", e); }
                    playerInstance.player = false;
                    return true;
                }
                return false;
            };
            
            if(checkAndDestroy()) return;
            var id = setInterval(function () {
                if (checkAndDestroy() || ++count > 60) clearInterval(id);
            }, 500);
        });
    };

    // ==================== 启动 ====================
    obj.run = function () {
        var url = location.href;
        console.log("[TTxiaohuang] 进入 obj.run，进行环境判定，URL:", url);
        obj.setupXHRHook();

        if (url.indexOf(".baidu.com/pfile/video") > 0) {
            obj.video_page.flag = "pfilevideo";
            obj.pageReady(function () {
                var app = document.querySelector("#app");
                if (app && app.__vue_app__) {
                    app.__vue_app__.config.globalProperties.$router.afterEach(function (to, from) {
                        if (from.fullPath !== "/" && from.fullPath !== to.fullPath) location.reload();
                    });
                }
            });
        } else {
            obj.pageReady(function () {
                if (url.indexOf(".baidu.com/s/") > 0) {
                    console.log("[TTxiaohuang] 判定为 sharevideo");
                    obj.video_page.flag = "sharevideo";
                    obj.playSharePage();
                } else if (url.indexOf(".baidu.com/play/video") > 0 || url.indexOf(".baidu.com/disk/") > 0 || url.indexOf(".baidu.com/video") > 0) {
                    console.log("[TTxiaohuang] 判定为 playvideo");
                    obj.video_page.flag = "playvideo";
                    window.onhashchange = function () { 
                        if (location.href.indexOf("/video") > 0) location.reload(); 
                    };
                } else if (url.indexOf(".baidu.com/mbox/streampage") > 0) {
                    console.log("[TTxiaohuang] 判定为 mboxvideo");
                    obj.video_page.flag = "mboxvideo";
                } else {
                    console.log("[TTxiaohuang] 无法判定当前页面的 flag!");
                }
            });
        }
    }();

    console.log("=== 百度网盘增强播放器 ===");
})();
