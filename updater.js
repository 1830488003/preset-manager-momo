// -----------------------------------------------------------------
// 自动更新逻辑 (借鉴自 JS-Slash-Runner)
// -----------------------------------------------------------------

// 立即执行的异步函数，封装所有更新相关的逻辑
(async function() {
    // 确保在SillyTavern的核心脚本加载完毕后执行
    if (!window.SillyTavern || !window.SillyTavern.getContext) {
        // 如果核心API还不可用，稍后重试
        setTimeout(arguments.callee, 100);
        return;
    }

    // 从全局上下文获取必要的SillyTavern API
    const { getRequestHeaders, extension_api: { POPUP_TYPE, callGenericPopup, t } } = window.SillyTavern.getContext();

    // ------------------- 配置常量 -------------------
    const GITHUB_REPO = "1830488003/preset-manager-momo";
    const GITHUB_BRANCH = "main";
    const VERSION_FILE_PATH = "manifest.json";
    const CHANGELOG_FILE_PATH = "preset-manager-momo/preset-manager-momo项目文档.txt"; // 指向项目文档
    const EXTENSION_NAME = "preset-manager-momo";

    let localVersion;
    let remoteVersion;
    let changelogContent;
    let updateAvailable = false;

    /**
     * 从 GitHub 仓库获取指定文件的原始内容。
     * @param {string} filePath - 文件在仓库中的路径。
     * @returns {Promise<string>} 文件内容的 Promise。
     */
    async function fetchRawFileFromGitHub(filePath) {
        const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`GitHub 请求失败: ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 获取 GitHub 文件内容时出错:`, error);
            throw error;
        }
    }

    /**
     * 从本地路径获取文件内容。
     * @param {string} filePath - 文件的本地路径。
     * @returns {Promise<string>} 文件内容的 Promise。
     */
    async function getLocalFileContent(filePath) {
        try {
            const response = await fetch(filePath, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`本地文件请求失败: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 读取本地文件 ${filePath} 失败:`, error);
            throw error;
        }
    }

    /**
     * 从 JSON 文件内容中解析 'version' 字段。
     * @param {string} content - 文件内容字符串。
     * @returns {string} 解析出的版本号。
     */
    function parseVersionFromManifest(content) {
        try {
            const data = JSON.parse(content);
            if (data && typeof data.version === 'string') {
                return data.version;
            }
            throw new Error("在 manifest.json 中未找到有效的 'version' 字段。");
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 解析版本文件内容时出错:`, error);
            throw error;
        }
    }

    /**
     * 比较两个语义化版本号。
     * @param {string} v1 - 版本号 A。
     * @param {string} v2 - 版本号 B。
     * @returns {number} 1 (v1>v2), -1 (v1<v2), 0 (v1=v2)。
     */
    function compareVersions(v1, v2) {
        const parts1 = v1.replace('v', '').split('.').map(Number);
        const parts2 = v2.replace('v', '').split('.').map(Number);
        const len = Math.max(parts1.length, parts2.length);

        for (let i = 0; i < len; i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    /**
     * 检查更新。
     */
    async function checkForUpdates() {
        const statusText = $("#momo-update-status-text");
        const checkBtn = $("#momo-check-update-btn");

        checkBtn.prop("disabled", true).find('i').addClass('fa-spin');
        statusText.text("正在检查更新...").show();
        updateAvailable = false; // 重置状态

        try {
            const remoteManifestContent = await fetchRawFileFromGitHub(VERSION_FILE_PATH);
            remoteVersion = parseVersionFromManifest(remoteManifestContent);

            const localManifestPath = `/scripts/extensions/third-party/${EXTENSION_NAME}/${VERSION_FILE_PATH}`;
            const localManifestContent = await getLocalFileContent(localManifestPath);
            localVersion = parseVersionFromManifest(localManifestContent);
            
            $("#momo-current-version").text(localVersion); // 确保界面显示的是最新的本地版本

            if (compareVersions(remoteVersion, localVersion) > 0) {
                updateAvailable = true;
                const updateUrl = `https://github.com/${GITHUB_REPO}`;
                statusText.html(`发现新版本: <strong>${remoteVersion}</strong>！`);
                checkBtn.text("立即更新").off('click touchend').on('click touchend', handleUpdateButtonClick);
            } else {
                statusText.text("恭喜，您使用的已是最新版本！");
                checkBtn.text("已是最新");
            }
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 检查更新失败:`, error);
            statusText.text(`检查更新失败: ${error.message}`);
            checkBtn.text("检查更新"); // 恢复按钮文字
        } finally {
            checkBtn.prop("disabled", false).find('i').removeClass('fa-spin');
        }
    }

    /**
     * 处理更新按钮点击事件。
     */
    async function handleUpdateButtonClick(event) {
        event.preventDefault();
        event.stopPropagation();

        if (!updateAvailable) {
            toastr.info("已经是最新版本，无需更新。");
            return;
        }

        const btn = $(this);
        btn.prop("disabled", true).html('<i class="fas fa-spinner fa-spin"></i> 获取日志...');

        try {
            if (!changelogContent) {
                const fullLog = await fetchRawFileFromGitHub(CHANGELOG_FILE_PATH);
                // 简化处理：直接显示最新版本的日志
                const versionHeader = `### **版本 ${remoteVersion}`;
                const logStartIndex = fullLog.indexOf(versionHeader);
                if (logStartIndex !== -1) {
                    const nextVersionIndex = fullLog.indexOf("### **版本", logStartIndex + 1);
                    changelogContent = nextVersionIndex !== -1 
                        ? fullLog.substring(logStartIndex, nextVersionIndex) 
                        : fullLog.substring(logStartIndex);
                } else {
                    changelogContent = "无法解析最新的更新日志。";
                }
            }
            
            // 将Markdown的###标题转换为HTML的h3
            const formattedLog = changelogContent.replace(/###\s*(.*)/g, '<h3>$1</h3>').replace(/\n/g, '<br>');


            const result = await callGenericPopup(
                `<h3>发现新版本: ${remoteVersion}</h3><hr>${formattedLog}`,
                POPUP_TYPE.CONFIRM,
                '',
                { okButton: '确认更新', cancelButton: '稍后再说', wide: true }
            );

            if (result) {
                await executeUpdate(btn);
            } else {
                btn.prop("disabled", false).text("立即更新");
            }

        } catch (error) {
            toastr.error(`获取更新日志失败: ${error.message}`);
            btn.prop("disabled", false).text("立即更新");
        }
    }

    /**
     * 执行实际的更新操作。
     */
    async function executeUpdate(btn) {
        btn.html('<i class="fas fa-spinner fa-spin"></i> 更新中...');
        toastr.info("正在开始更新，请勿刷新页面...");

        try {
            // SillyTavern 内置的更新API需要知道扩展是 global 还是 local
            // 我们假设它是 local，因为这是最常见的情况
            const response = await fetch('/api/extensions/update', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ extensionName: EXTENSION_NAME, global: false }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || `更新API返回错误: ${response.status}`);
            }

            const data = await response.json();
            if (data.isUpToDate) {
                toastr.warning("扩展已经是最新版本。");
                btn.prop("disabled", false).text("已是最新");
            } else {
                toastr.success(`更新成功！3秒后将自动刷新页面...`);
                setTimeout(() => location.reload(), 3000);
            }
        } catch (error) {
            console.error(`[${EXTENSION_NAME}] 更新失败:`, error);
            toastr.error(`更新失败: ${error.message}`, "错误", { timeOut: 10000 });
            btn.prop("disabled", false).text("重试更新");
        }
    }

    // 将检查更新函数暴露到全局，以便 index.js 可以调用
    window.PresetManagerMomoUpdater = {
        checkForUpdates
    };

})();
