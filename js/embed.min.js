// 所有超链接使用新窗口打开
$(document).ready(function () {
    $('a[href^="http"]').each(function () {
        $(this).attr('target', '_blank');
    });
});